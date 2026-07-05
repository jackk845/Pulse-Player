import api from './api.js';

class Player extends EventTarget {
  constructor() {
    super();
    this.audio = new Audio();
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    
    // Playback settings
    this.repeatMode = localStorage.getItem('pulse_repeat_mode') || 'none'; // 'none', 'all', 'one'
    this.isShuffled = false;
    this.originalQueue = []; // Holds order before shuffle
    
    // Scrobbling tracking
    this.scrobbledCurrent = false;
    this.nowPlayingNotified = false;
    
    // Initialize volume
    const savedVolume = localStorage.getItem('pulse_volume');
    this.volume = savedVolume !== null ? parseFloat(savedVolume) : 0.8;
    this.audio.volume = this.volume;

    // Load saved queue
    this.restoreQueue();

    this.setupAudioListeners();
    this.setupMediaSession();
  }

  setupAudioListeners() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.dispatchEvent(new CustomEvent('playstatechange', { detail: { isPlaying: true } }));
      this.updateMediaSessionState();
      
      // Notify Navidrome of "now playing" status (submission=false)
      if (!this.nowPlayingNotified && this.currentTrack) {
        this.nowPlayingNotified = true;
        api.scrobble(this.currentTrack.id, false).catch(err => {
          console.warn('Failed to notify now playing:', err);
        });
      }
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.dispatchEvent(new CustomEvent('playstatechange', { detail: { isPlaying: false } }));
      this.updateMediaSessionState();
    });

    this.audio.addEventListener('timeupdate', () => {
      const duration = this.audio.duration || 0;
      const currentTime = this.audio.currentTime;

      // Scrobble check: trigger submission=true when 50% or 4 minutes of track has elapsed
      if (!this.scrobbledCurrent && duration > 0 && this.currentTrack) {
        const threshold = Math.min(duration * 0.5, 240); // 50% or 4 minutes
        if (currentTime >= threshold) {
          this.scrobbledCurrent = true;
          api.scrobble(this.currentTrack.id, true).catch(err => {
            console.warn('Failed to submit scrobble:', err);
          });
        }
      }

      this.dispatchEvent(new CustomEvent('timeupdate', {
        detail: {
          currentTime: currentTime,
          duration: duration,
          percent: (currentTime / (duration || 1)) * 100
        }
      }));
    });

    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      this.dispatchEvent(new CustomEvent('error', { detail: e }));
      // Automatically advance to next track on error to avoid freezing
      if (this.queue.length > 1) {
        setTimeout(() => this.next(), 1000);
      }
    });

    this.audio.addEventListener('volumechange', () => {
      this.volume = this.audio.volume;
      localStorage.setItem('pulse_volume', this.volume);
      this.dispatchEvent(new CustomEvent('volumechange', { detail: { volume: this.volume } }));
    });
  }

  get currentTrack() {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      return this.queue[this.currentIndex];
    }
    return null;
  }

  // Load state from local storage
  restoreQueue() {
    try {
      const savedQueue = localStorage.getItem('pulse_play_queue');
      const savedIndex = localStorage.getItem('pulse_play_index');
      
      if (savedQueue) {
        this.queue = JSON.parse(savedQueue);
        this.originalQueue = [...this.queue];
        
        if (savedIndex !== null) {
          const index = parseInt(savedIndex, 10);
          if (index >= 0 && index < this.queue.length) {
            this.currentIndex = index;
            const track = this.queue[index];
            this.audio.src = api.getStreamUrl(track.id);
            this.audio.load();
            // Dispatch initial track change without playing
            setTimeout(() => {
              this.dispatchEvent(new CustomEvent('trackchange', { detail: { track, playImmediately: false } }));
              this.updateMediaSessionMetadata();
            }, 50);
          }
        }
      }
    } catch (e) {
      console.error('Failed to restore play queue:', e);
    }
  }

  saveQueue() {
    localStorage.setItem('pulse_play_queue', JSON.stringify(this.queue));
    localStorage.setItem('pulse_play_index', this.currentIndex.toString());
  }

  // Queue manipulation methods
  setQueue(tracks, startIndex = 0, playImmediately = true) {
    if (!tracks || tracks.length === 0) return;
    
    this.queue = [...tracks];
    this.originalQueue = [...tracks];
    this.isShuffled = false;
    this.currentIndex = Math.max(0, Math.min(startIndex, this.queue.length - 1));
    
    this.saveQueue();
    this.dispatchEvent(new CustomEvent('queuechange', { detail: { queue: this.queue } }));
    
    this.playTrackAt(this.currentIndex, playImmediately);
  }

  enqueue(track, playNext = false) {
    // Prevent duplicate entries of the same track in immediate succession
    const isDuplicate = this.queue.some(t => t.id === track.id);
    if (isDuplicate) {
      // If it exists, we can still add it, but maybe just move it or append it.
      // Standard players allow duplicates. Let's just allow it.
    }

    if (this.queue.length === 0) {
      this.setQueue([track], 0, true);
      return;
    }

    if (playNext) {
      const insertIndex = this.currentIndex + 1;
      this.queue.splice(insertIndex, 0, track);
      if (!this.isShuffled) {
        const origIndex = this.originalQueue.findIndex(t => t.id === this.currentTrack?.id);
        this.originalQueue.splice(origIndex + 1, 0, track);
      }
    } else {
      this.queue.push(track);
      this.originalQueue.push(track);
    }

    this.saveQueue();
    this.dispatchEvent(new CustomEvent('queuechange', { detail: { queue: this.queue } }));
  }

  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return;
    
    const trackToRemove = this.queue[index];
    this.queue.splice(index, 1);
    
    // Update original queue too
    const origIndex = this.originalQueue.indexOf(trackToRemove);
    if (origIndex !== -1) {
      this.originalQueue.splice(origIndex, 1);
    }

    if (index === this.currentIndex) {
      // We removed the active song
      if (this.queue.length === 0) {
        this.clearQueue();
      } else {
        this.currentIndex = Math.min(this.currentIndex, this.queue.length - 1);
        this.playTrackAt(this.currentIndex, this.isPlaying);
      }
    } else if (index < this.currentIndex) {
      // Shift index back
      this.currentIndex--;
    }

    this.saveQueue();
    this.dispatchEvent(new CustomEvent('queuechange', { detail: { queue: this.queue } }));
  }

  clearQueue() {
    this.audio.pause();
    this.audio.src = '';
    this.queue = [];
    this.originalQueue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    
    this.saveQueue();
    this.dispatchEvent(new CustomEvent('queuechange', { detail: { queue: [] } }));
    this.dispatchEvent(new CustomEvent('trackchange', { detail: { track: null } }));
    this.dispatchEvent(new CustomEvent('playstatechange', { detail: { isPlaying: false } }));
    
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
  }

  // Playback Controls
  playTrackAt(index, playImmediately = true) {
    if (index < 0 || index >= this.queue.length) return;
    
    this.currentIndex = index;
    const track = this.queue[index];
    
    // Reset scrobble status for the new track
    this.scrobbledCurrent = false;
    this.nowPlayingNotified = false;

    // Save state
    this.saveQueue();
    
    // Set audio source
    this.audio.src = api.getStreamUrl(track.id);
    this.audio.load();
    
    this.dispatchEvent(new CustomEvent('trackchange', { detail: { track, playImmediately } }));
    this.updateMediaSessionMetadata();

    if (playImmediately) {
      this.audio.play()
        .then(() => {
          this.isPlaying = true;
        })
        .catch(err => {
          console.error('Failed to trigger audio play:', err);
        });
    }
  }

  togglePlay() {
    if (this.queue.length === 0) return;
    
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      if (!this.audio.src || this.audio.src === '') {
        this.playTrackAt(this.currentIndex >= 0 ? this.currentIndex : 0);
      } else {
        this.audio.play().catch(err => console.error(err));
      }
    }
  }

  play() {
    if (this.isPlaying || this.queue.length === 0) return;
    this.audio.play().catch(err => console.error(err));
  }

  pause() {
    if (!this.isPlaying) return;
    this.audio.pause();
  }

  next() {
    if (this.queue.length === 0) return;
    
    let nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.queue.length) {
      if (this.repeatMode === 'all') {
        nextIndex = 0;
      } else {
        return; // End of queue
      }
    }
    
    this.playTrackAt(nextIndex, true);
  }

  prev() {
    if (this.queue.length === 0) return;

    // If current song is > 3 seconds, restart the song instead of going to prev
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }

    let prevIndex = this.currentIndex - 1;
    if (prevIndex < 0) {
      if (this.repeatMode === 'all') {
        prevIndex = this.queue.length - 1;
      } else {
        this.seek(0);
        return;
      }
    }

    this.playTrackAt(prevIndex, true);
  }

  seek(percent) {
    if (!this.audio.duration) return;
    const time = (percent / 100) * this.audio.duration;
    this.audio.currentTime = time;
  }

  setVolume(value) {
    const val = Math.max(0, Math.min(1, value));
    this.audio.volume = val;
  }

  toggleMute() {
    if (this.audio.muted) {
      this.audio.muted = false;
      this.dispatchEvent(new CustomEvent('volumechange', { detail: { volume: this.volume } }));
    } else {
      this.audio.muted = true;
      this.dispatchEvent(new CustomEvent('volumechange', { detail: { volume: 0 } }));
    }
  }

  setRepeatMode(mode) {
    if (['none', 'all', 'one'].includes(mode)) {
      this.repeatMode = mode;
      localStorage.setItem('pulse_repeat_mode', mode);
      this.dispatchEvent(new CustomEvent('repeatchange', { detail: { repeatMode: mode } }));
    }
  }

  toggleRepeat() {
    const modes = ['none', 'all', 'one'];
    const nextModeIndex = (modes.indexOf(this.repeatMode) + 1) % modes.length;
    this.setRepeatMode(modes[nextModeIndex]);
  }

  toggleShuffle() {
    if (this.queue.length === 0) return;
    
    this.isShuffled = !this.isShuffled;
    
    if (this.isShuffled) {
      // Store current track, shuffle the rest of the queue
      const currentTrack = this.currentTrack;
      const otherTracks = this.queue.filter((_, idx) => idx !== this.currentIndex);
      
      // Fisher-Yates Shuffle
      for (let i = otherTracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
      }
      
      this.queue = [currentTrack, ...otherTracks];
      this.currentIndex = 0;
    } else {
      // Restore original queue order
      const currentTrackId = this.currentTrack?.id;
      this.queue = [...this.originalQueue];
      
      // Update current index to match current playing track's new index in original queue
      this.currentIndex = this.queue.findIndex(t => t.id === currentTrackId);
    }
    
    this.saveQueue();
    this.dispatchEvent(new CustomEvent('shufflechange', { detail: { isShuffled: this.isShuffled } }));
    this.dispatchEvent(new CustomEvent('queuechange', { detail: { queue: this.queue } }));
  }

  handleTrackEnded() {
    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.audio.play().catch(err => console.error(err));
    } else {
      this.next();
    }
  }

  // Media Session integration
  setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    
    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.fastSeek && this.audio.fastSeek) {
          this.audio.fastSeek(details.seekTime);
        } else {
          this.audio.currentTime = details.seekTime;
        }
      });
    } catch (e) {
      // Some browsers don't support seekto handler
    }
  }

  updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !this.currentTrack) return;
    
    const track = this.currentTrack;
    const coverUrl = api.getCoverArtUrl(track.coverArt || track.albumId, 500);

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      artwork: coverUrl ? [
        { src: coverUrl, sizes: '96x96', type: 'image/png' },
        { src: coverUrl, sizes: '128x128', type: 'image/png' },
        { src: coverUrl, sizes: '192x192', type: 'image/png' },
        { src: coverUrl, sizes: '256x256', type: 'image/png' },
        { src: coverUrl, sizes: '384x384', type: 'image/png' },
        { src: coverUrl, sizes: '512x512', type: 'image/png' },
      ] : []
    });
  }

  updateMediaSessionState() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
  }
}

export const player = new Player();
export default player;
