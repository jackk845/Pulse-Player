import api from './api.js';
import player from './player.js';
import getIcon from './icons.js';

class UI {
  constructor() {
    this.history = [];
    this.currentView = 'home';
    this.currentViewId = null;

    // Cache DOM Elements
    this.contentArea = document.getElementById('content-area');
    this.contentFrame = document.getElementById('content-frame');
    this.viewTitle = document.getElementById('view-title');
    this.backBtn = document.getElementById('back-btn');
    this.statusBadge = document.getElementById('status-badge');
    this.statusText = this.statusBadge.querySelector('.status-text');

    // Modals
    this.settingsModal = document.getElementById('settings-modal');
    this.settingsForm = document.getElementById('settings-form');
    this.settingsCancelBtn = document.getElementById('settings-cancel-btn');
    this.modalStatus = document.getElementById('modal-status');

    // Sidebar Now Playing
    this.sidebarNowPlaying = document.getElementById('sidebar-now-playing');
    this.sidebarArt = document.getElementById('sidebar-art');
    this.sidebarTitle = document.getElementById('sidebar-title');
    this.sidebarArtist = document.getElementById('sidebar-artist');
    this.sidebarFavBtn = document.getElementById('sidebar-fav-btn');

    // Mini Player Now Playing
    this.playerMiniArt = document.getElementById('player-mini-art');
    this.playerMiniTitle = document.getElementById('player-mini-title');
    this.playerMiniArtist = document.getElementById('player-mini-artist');

    // Controls
    this.playBtn = document.getElementById('play-btn');
    this.prevBtn = document.getElementById('prev-btn');
    this.nextBtn = document.getElementById('next-btn');
    this.shuffleBtn = document.getElementById('shuffle-btn');
    this.repeatBtn = document.getElementById('repeat-btn');
    
    // Progress
    this.timeCurrent = document.getElementById('time-current');
    this.timeTotal = document.getElementById('time-total');
    this.progressBarWrapper = document.getElementById('progress-bar-wrapper');
    this.progressBar = document.getElementById('progress-bar');

    // Utilities
    this.queueToggleBtn = document.getElementById('queue-toggle-btn');
    this.volumeBtn = document.getElementById('volume-btn');
    this.volumeSliderWrapper = document.getElementById('volume-slider-wrapper');
    this.volumeSlider = document.getElementById('volume-slider');

    // Queue Panel
    this.queuePanel = document.getElementById('queue-panel');
    this.queueList = document.getElementById('queue-list');
    this.closeQueueBtn = document.getElementById('close-queue-btn');
    this.clearQueueBtn = document.getElementById('clear-queue-btn');

    // Ambient Canvas
    this.canvas = document.getElementById('ambient-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ambientColors = {
      c1: { r: 121, g: 40, b: 202 },  // Deep violet
      c2: { r: 255, g: 0, b: 127 },   // Neon pink
      c3: { r: 7, g: 7, b: 10 }       // Dark base
    };
    this.targetColors = { ...this.ambientColors };
    this.ambientAngle = 0;

    this.init();
  }

  init() {
    this.renderIcons();
    this.setupEventListeners();
    this.setupPlayerSync();
    this.startAmbientAnimation();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  // Inject SVGs into any element with data-icon
  renderIcons() {
    document.querySelectorAll('[data-icon]').forEach(el => {
      const iconName = el.getAttribute('data-icon');
      el.innerHTML = getIcon(iconName);
    });
  }

  // Setup UI interaction events
  setupEventListeners() {
    // Navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.getAttribute('data-view');
        this.navigateTo(view);
      });
    });

    // Back Button
    this.backBtn.addEventListener('click', () => this.goBack());

    // Settings modal triggers
    document.getElementById('settings-trigger').addEventListener('click', () => {
      this.openSettingsModal();
    });

    this.settingsCancelBtn.addEventListener('click', () => {
      this.closeSettingsModal();
    });

    this.settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveSettings();
    });

    // Player Buttons
    this.playBtn.addEventListener('click', () => player.togglePlay());
    this.prevBtn.addEventListener('click', () => player.prev());
    this.nextBtn.addEventListener('click', () => player.next());
    this.shuffleBtn.addEventListener('click', () => player.toggleShuffle());
    this.repeatBtn.addEventListener('click', () => player.toggleRepeat());

    // Progress bar scrubbing
    this.progressBarWrapper.addEventListener('click', (e) => {
      const rect = this.progressBarWrapper.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      player.seek(percent);
    });

    // Volume scrubbing
    this.volumeSliderWrapper.addEventListener('click', (e) => {
      const rect = this.volumeSliderWrapper.getBoundingClientRect();
      const volume = (e.clientX - rect.left) / rect.width;
      player.setVolume(volume);
    });

    this.volumeBtn.addEventListener('click', () => player.toggleMute());

    // Queue Drawer toggling
    this.queueToggleBtn.addEventListener('click', () => {
      this.queuePanel.classList.toggle('open');
      this.queueToggleBtn.classList.toggle('active');
    });

    this.closeQueueBtn.addEventListener('click', () => {
      this.queuePanel.classList.remove('open');
      this.queueToggleBtn.classList.remove('active');
    });

    this.clearQueueBtn.addEventListener('click', () => {
      if (confirm('Clear the current play queue?')) {
        player.clearQueue();
      }
    });

    // Sidebar Favorite toggle
    this.sidebarFavBtn.addEventListener('click', async () => {
      const track = player.currentTrack;
      if (!track) return;
      
      const isStarred = track.starred;
      try {
        if (isStarred) {
          await api.unstar(track.id);
          track.starred = false;
        } else {
          await api.star(track.id);
          track.starred = true;
        }
        this.updateFavBtn(track.starred);
        // Refresh active list if we are currently looking at Starred view
        if (this.currentView === 'starred') {
          this.refreshCurrentView();
        }
      } catch (err) {
        console.error('Failed to toggle star:', err);
      }
    });
  }

  // Hook up event listeners to sync Player state with UI
  setupPlayerSync() {
    player.addEventListener('playstatechange', (e) => {
      const isPlaying = e.detail.isPlaying;
      this.playBtn.innerHTML = getIcon(isPlaying ? 'pause' : 'play');
      
      // Update EQ display in rows
      document.querySelectorAll('.track-row').forEach(row => {
        if (row.classList.contains('active')) {
          row.classList.toggle('playing', isPlaying);
        }
      });
    });

    player.addEventListener('trackchange', (e) => {
      const track = e.detail?.track;
      this.updateNowPlayingUI(track);
    });

    player.addEventListener('timeupdate', (e) => {
      const { currentTime, duration, percent } = e.detail;
      this.timeCurrent.textContent = this.formatTime(currentTime);
      this.timeTotal.textContent = this.formatTime(duration);
      this.progressBar.style.width = `${percent}%`;
    });

    player.addEventListener('volumechange', (e) => {
      const vol = e.detail.volume;
      this.volumeSlider.style.width = `${vol * 100}%`;
      
      let volIcon = 'volume2';
      if (vol === 0) volIcon = 'volumeX';
      else if (vol < 0.4) volIcon = 'volume1';
      
      this.volumeBtn.innerHTML = getIcon(volIcon);
    });

    player.addEventListener('repeatchange', (e) => {
      const mode = e.detail.repeatMode;
      this.repeatBtn.innerHTML = getIcon(mode === 'one' ? 'repeatOne' : 'repeat');
      this.repeatBtn.classList.toggle('active', mode !== 'none');
    });

    player.addEventListener('shufflechange', (e) => {
      const isShuffled = e.detail.isShuffled;
      this.shuffleBtn.classList.toggle('active', isShuffled);
    });

    player.addEventListener('queuechange', (e) => {
      this.renderQueueList(e.detail.queue);
    });
  }

  // Update connection indicator badge
  updateStatus(status, text) {
    this.statusBadge.className = `status-badge ${status}`;
    this.statusText.textContent = text;
  }

  // Settings Modal controls
  openSettingsModal() {
    document.getElementById('server-url').value = api.serverUrl;
    document.getElementById('username').value = api.username;
    document.getElementById('password').value = api.password;
    
    this.modalStatus.style.display = 'none';
    this.settingsModal.classList.add('open');
  }

  closeSettingsModal() {
    this.settingsModal.classList.remove('open');
  }

  async saveSettings() {
    const url = document.getElementById('server-url').value;
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;

    this.modalStatus.className = 'modal-status loading';
    this.modalStatus.textContent = 'Testing connection...';
    this.modalStatus.style.display = 'block';

    try {
      // Temporarily test settings
      const tempApi = new api.constructor();
      tempApi.setCredentials(url, user, pass);
      await tempApi.ping();
      
      // Connection successful: save globally
      api.setCredentials(url, user, pass);
      this.updateStatus('connected', 'Connected');
      
      this.modalStatus.className = 'modal-status success';
      this.modalStatus.textContent = 'Connected successfully!';
      
      setTimeout(() => {
        this.closeSettingsModal();
        this.navigateTo('home', null, true); // Refresh and clear history
      }, 1000);
    } catch (err) {
      console.error(err);
      this.modalStatus.className = 'modal-status error';
      this.modalStatus.textContent = `Connection failed: ${err.message || 'Check credentials'}`;
    }
  }

  // View Navigation System
  navigateTo(view, id = null, clearHistory = false) {
    if (clearHistory) {
      this.history = [];
    } else {
      // Don't push duplicate states
      const lastState = this.history[this.history.length - 1];
      if (!lastState || lastState.view !== this.currentView || lastState.id !== this.currentViewId) {
        this.history.push({ view: this.currentView, id: this.currentViewId });
      }
    }

    this.currentView = view;
    this.currentViewId = id;
    
    // Toggle active sidebar navigation items
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
      const itemView = item.getAttribute('data-view');
      item.classList.toggle('active', itemView === view);
    });

    // Update back button state
    this.backBtn.classList.toggle('hidden', this.history.length === 0);

    // Load actual content
    this.loadView(view, id);
  }

  goBack() {
    if (this.history.length === 0) return;
    const prevState = this.history.pop();
    this.currentView = prevState.view;
    this.currentViewId = prevState.id;
    
    this.backBtn.classList.toggle('hidden', this.history.length === 0);
    
    // Toggle active sidebar navigation items
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
      const itemView = item.getAttribute('data-view');
      item.classList.toggle('active', itemView === prevState.view);
    });

    this.loadView(prevState.view, prevState.id, false);
  }

  refreshCurrentView() {
    this.loadView(this.currentView, this.currentViewId);
  }

  async loadView(view, id) {
    // Reset view scroll position
    this.contentFrame.scrollTop = 0;
    
    if (!api.hasCredentials()) {
      this.renderEmptyState('plug', 'Not Connected', 'Click Settings in the sidebar to configure your Navidrome server.');
      this.viewTitle.textContent = 'Welcome';
      return;
    }

    this.renderLoader();

    try {
      switch (view) {
        case 'home':
          this.viewTitle.textContent = 'Home';
          await this.renderHome();
          break;
        case 'albums':
          this.viewTitle.textContent = 'Albums';
          await this.renderAlbums();
          break;
        case 'artists':
          this.viewTitle.textContent = 'Artists';
          await this.renderArtists();
          break;
        case 'playlists':
          this.viewTitle.textContent = 'Playlists';
          await this.renderPlaylists();
          break;
        case 'starred':
          this.viewTitle.textContent = 'Favorites';
          await this.renderStarred();
          break;
        case 'search':
          this.viewTitle.textContent = 'Search';
          this.renderSearchContainer();
          break;
        case 'album':
          await this.renderAlbumDetail(id);
          break;
        case 'artist':
          await this.renderArtistDetail(id);
          break;
        case 'playlist':
          await this.renderPlaylistDetail(id);
          break;
        default:
          this.renderEmptyState('music', 'Under Construction', 'This view is not yet implemented.');
      }
    } catch (err) {
      console.error(err);
      this.renderEmptyState('close', 'Error Loading Content', err.message || 'An error occurred while communicating with the server.');
    }
  }

  // Render Helpers
  renderLoader() {
    this.contentArea.innerHTML = `
      <div class="empty-state">
        <div class="brand-logo" style="margin-bottom: 20px; animation: logo-spin 1.5s linear infinite;"></div>
        <h3>Loading your library...</h3>
      </div>
    `;
  }

  renderEmptyState(icon, title, message) {
    this.contentArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${getIcon(icon)}</div>
        <h3>${title}</h3>
        <p>${message}</p>
      </div>
    `;
  }

  // Dynamic Content Renderers
  async renderHome() {
    // Fetch dashboard content in parallel
    const [newAlbumsRes, randomAlbumsRes] = await Promise.all([
      api.getAlbumList('newest', 6).catch(() => null),
      api.getAlbumList('random', 6).catch(() => null)
    ]);

    const newAlbums = newAlbumsRes?.albumList2?.album || [];
    const randomAlbums = randomAlbumsRes?.albumList2?.album || [];

    if (newAlbums.length === 0 && randomAlbums.length === 0) {
      this.renderEmptyState('music', 'Library is Empty', 'No albums were found on your server. Make sure your library is scanned.');
      return;
    }

    let html = `
      <div class="home-hero">
        <div class="home-hero-text">
          <span class="detail-type">Welcome to Pulse</span>
          <h1>Your Music, Elevated</h1>
          <p>Stream your personal audio collection in high fidelity with immersive ambient graphics and responsive desktop controls.</p>
          <button class="btn primary home-hero-btn" id="hero-random-play">
            ${getIcon('play')} Play Random Songs
          </button>
        </div>
      </div>
    `;

    // Recently Added Section
    if (newAlbums.length > 0) {
      html += `
        <div class="home-section">
          <div class="section-header">
            <h2>Recently Added Albums</h2>
            <a href="#" class="view-all-link" id="view-all-new">View All</a>
          </div>
          <div class="card-grid">
            ${this.buildAlbumGridHtml(newAlbums)}
          </div>
        </div>
      `;
    }

    // Discover Section
    if (randomAlbums.length > 0) {
      html += `
        <div class="home-section">
          <div class="section-header">
            <h2>Mix It Up</h2>
            <a href="#" class="view-all-link" id="view-all-random">View All</a>
          </div>
          <div class="card-grid">
            ${this.buildAlbumGridHtml(randomAlbums)}
          </div>
        </div>
      `;
    }

    this.contentArea.innerHTML = html;

    // Attach specific listeners
    document.getElementById('hero-random-play').addEventListener('click', async () => {
      try {
        const randSongsRes = await api.request('rest/getRandomSongs.view', { size: 30 });
        const songs = randSongsRes?.randomSongs?.song || [];
        if (songs.length > 0) {
          player.setQueue(songs, 0, true);
        }
      } catch (err) {
        alert('Failed to fetch random songs: ' + err.message);
      }
    });

    document.getElementById('view-all-new').addEventListener('click', (e) => {
      e.preventDefault();
      this.navigateTo('albums');
    });

    if (document.getElementById('view-all-random')) {
      document.getElementById('view-all-random').addEventListener('click', (e) => {
        e.preventDefault();
        // Force random shuffle load on album grid
        this.navigateTo('albums');
      });
    }

    this.attachCardEventListeners();
  }

  async renderAlbums() {
    const res = await api.getAlbumList('alphabeticalByName', 100);
    const albums = res?.albumList2?.album || [];

    if (albums.length === 0) {
      this.renderEmptyState('album', 'No Albums Found', 'Make sure your music directories are mounted and scanned.');
      return;
    }

    this.contentArea.innerHTML = `
      <div class="card-grid">
        ${this.buildAlbumGridHtml(albums)}
      </div>
    `;

    this.attachCardEventListeners();
  }

  async renderArtists() {
    const res = await api.getArtists();
    
    // Navidrome packages artists in getArtists under a structured list index
    const index = res?.artists?.index || [];
    const artists = [];
    index.forEach(idx => {
      if (idx.artist) {
        artists.push(...idx.artist);
      }
    });

    if (artists.length === 0) {
      this.renderEmptyState('artist', 'No Artists Found', 'No artist tags detected in your media files.');
      return;
    }

    // Sort alphabetically
    artists.sort((a, b) => a.name.localeCompare(b.name));

    let html = '<div class="card-grid">';
    artists.forEach(artist => {
      const artUrl = api.getCoverArtUrl(artist.id, 200) || '';
      // Fallback symbol icon if no artist art
      const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%231b1b22'/><text x='50%' y='55%' font-family='sans-serif' font-size='32' fill='%23555' text-anchor='middle'>${artist.name.charAt(0).toUpperCase()}</text></svg>`;

      html += `
        <div class="artist-card" data-artist-id="${artist.id}">
          <div class="artist-art-wrapper">
            <img src="${artUrl}" onerror="this.src=\`${fallbackArt}\`" alt="${artist.name}" loading="lazy">
          </div>
          <span class="card-title">${artist.name}</span>
          <span class="card-subtitle">${artist.albumCount || 0} Albums</span>
        </div>
      `;
    });
    html += '</div>';

    this.contentArea.innerHTML = html;

    // Attach listeners
    this.contentArea.querySelectorAll('.artist-card').forEach(card => {
      card.addEventListener('click', () => {
        const artistId = card.getAttribute('data-artist-id');
        this.navigateTo('artist', artistId);
      });
    });
  }

  async renderPlaylists() {
    const res = await api.getPlaylists();
    const playlists = res?.playlists?.playlist || [];

    if (playlists.length === 0) {
      this.renderEmptyState('playlist', 'No Playlists', 'You haven\'t created any playlists yet on your server.');
      return;
    }

    let html = '<div class="card-grid">';
    playlists.forEach(playlist => {
      // Cover art of playlist uses its coverArt id if present, or resolves to first song
      const artUrl = api.getCoverArtUrl(playlist.coverArt || playlist.id, 250);
      const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%231b1b22'/><text x='50%' y='55%' font-family='sans-serif' font-size='10' fill='%23555' text-anchor='middle'>Playlist</text></svg>`;

      html += `
        <div class="album-card" data-playlist-id="${playlist.id}">
          <div class="album-art-wrapper">
            <img src="${artUrl}" onerror="this.src=\`${fallbackArt}\`" alt="${playlist.name}" loading="lazy">
            <button class="play-hover-btn playlist-play-btn" data-playlist-play="${playlist.id}" title="Play Playlist">
              ${getIcon('play')}
            </button>
          </div>
          <span class="card-title">${playlist.name}</span>
          <span class="card-subtitle">${playlist.songCount} songs • By ${playlist.owner}</span>
        </div>
      `;
    });
    html += '</div>';

    this.contentArea.innerHTML = html;

    // Attach listeners
    this.contentArea.querySelectorAll('.album-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Prevent click if clicking play hover button directly
        if (e.target.closest('.play-hover-btn')) return;
        const playlistId = card.getAttribute('data-playlist-id');
        this.navigateTo('playlist', playlistId);
      });
    });

    this.contentArea.querySelectorAll('.playlist-play-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const playlistId = btn.getAttribute('data-playlist-play');
        try {
          const detailRes = await api.getPlaylist(playlistId);
          const songs = detailRes?.playlist?.entry || [];
          if (songs.length > 0) {
            player.setQueue(songs, 0, true);
          }
        } catch (err) {
          alert('Failed to play playlist: ' + err.message);
        }
      });
    });
  }

  async renderStarred() {
    const res = await api.getStarred();
    const starred = res?.starred2 || {};
    
    const songs = starred.song || [];
    const albums = starred.album || [];

    if (songs.length === 0 && albums.length === 0) {
      this.renderEmptyState('heartOutline', 'No Favorites', 'Tracks or albums you favorite will appear here.');
      return;
    }

    let html = '';
    
    if (albums.length > 0) {
      html += `
        <div class="home-section" style="margin-top: 16px;">
          <div class="section-header">
            <h2>Starred Albums</h2>
          </div>
          <div class="card-grid">
            ${this.buildAlbumGridHtml(albums)}
          </div>
        </div>
      `;
    }

    if (songs.length > 0) {
      html += `
        <div class="home-section" style="margin-top: 24px;">
          <div class="section-header">
            <h2>Favorite Tracks</h2>
            <button class="btn primary" id="starred-play-btn">
              ${getIcon('play')} Play All
            </button>
          </div>
          <div class="track-list">
            ${this.buildTrackListHtml(songs, false)}
          </div>
        </div>
      `;
    }

    this.contentArea.innerHTML = html;
    this.attachCardEventListeners();
    this.attachTrackEventListeners(songs);

    if (document.getElementById('starred-play-btn')) {
      document.getElementById('starred-play-btn').addEventListener('click', () => {
        player.setQueue(songs, 0, true);
      });
    }
  }

  renderSearchContainer() {
    this.contentArea.innerHTML = `
      <div class="search-container">
        <div class="search-icon-svg">${getIcon('search')}</div>
        <input type="search" class="search-input" id="search-input-field" placeholder="Search songs, albums, artists..." autofocus autocomplete="off">
      </div>
      <div id="search-results">
        <div class="empty-state" style="padding: 40px 0;">
          <p>Start typing to search your library...</p>
        </div>
      </div>
    `;

    const input = document.getElementById('search-input-field');
    let debounceTimeout = null;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimeout);
      const query = input.value.trim();
      if (!query) {
        document.getElementById('search-results').innerHTML = `
          <div class="empty-state" style="padding: 40px 0;">
            <p>Start typing to search your library...</p>
          </div>
        `;
        return;
      }

      debounceTimeout = setTimeout(() => {
        this.performSearch(query);
      }, 350);
    });
  }

  async performSearch(query) {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = `
      <div class="empty-state" style="padding: 40px 0;">
        <div class="brand-logo" style="margin-bottom: 20px; animation: logo-spin 1.5s linear infinite;"></div>
        <p>Searching...</p>
      </div>
    `;

    try {
      const res = await api.search(query, 6);
      const results = res?.searchResult3 || {};
      
      const songs = results.song || [];
      const albums = results.album || [];
      const artists = results.artist || [];

      if (songs.length === 0 && albums.length === 0 && artists.length === 0) {
        resultsContainer.innerHTML = `
          <div class="empty-state" style="padding: 40px 0;">
            <p>No results found for "${query}"</p>
          </div>
        `;
        return;
      }

      let html = '';

      // Artists Results
      if (artists.length > 0) {
        html += `
          <div class="search-results-section">
            <h3>Artists</h3>
            <div class="card-grid">
              ${artists.map(artist => {
                const artUrl = api.getCoverArtUrl(artist.id, 200);
                const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%231b1b22'/><text x='50%' y='55%' font-family='sans-serif' font-size='20' fill='%23555' text-anchor='middle'>${artist.name.charAt(0)}</text></svg>`;
                return `
                  <div class="artist-card" data-artist-id="${artist.id}" style="padding: 10px; gap: 8px;">
                    <div class="artist-art-wrapper" style="width: 80px; height: 80px;">
                      <img src="${artUrl}" onerror="this.src=\`${fallbackArt}\`" alt="${artist.name}">
                    </div>
                    <span class="card-title" style="font-size: 13px;">${artist.name}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // Albums Results
      if (albums.length > 0) {
        html += `
          <div class="search-results-section">
            <h3>Albums</h3>
            <div class="card-grid">
              ${this.buildAlbumGridHtml(albums)}
            </div>
          </div>
        `;
      }

      // Songs Results
      if (songs.length > 0) {
        html += `
          <div class="search-results-section">
            <h3>Tracks</h3>
            <div class="track-list">
              ${this.buildTrackListHtml(songs, true)}
            </div>
          </div>
        `;
      }

      resultsContainer.innerHTML = html;

      // Attach Event Listeners to search results
      resultsContainer.querySelectorAll('.artist-card').forEach(card => {
        card.addEventListener('click', () => {
          this.navigateTo('artist', card.getAttribute('data-artist-id'));
        });
      });

      this.attachCardEventListeners(resultsContainer);
      this.attachTrackEventListeners(songs, resultsContainer);

    } catch (err) {
      console.error(err);
      resultsContainer.innerHTML = `
        <div class="empty-state" style="padding: 40px 0;">
          <p>Search failed: ${err.message}</p>
        </div>
      `;
    }
  }

  async renderAlbumDetail(albumId) {
    const res = await api.getAlbum(albumId);
    const album = res?.album || {};
    const songs = album.song || [];

    this.viewTitle.textContent = album.title || 'Album Detail';

    const artUrl = api.getCoverArtUrl(album.coverArt || album.id, 400);
    const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%23111'/></svg>`;

    const totalDuration = songs.reduce((total, s) => total + (s.duration || 0), 0);
    const yearStr = album.year ? `${album.year} • ` : '';

    this.contentArea.innerHTML = `
      <div class="detail-header">
        <div class="detail-cover">
          <img src="${artUrl}" onerror="this.src=\`${fallbackArt}\`" alt="${album.name || album.title}">
        </div>
        <div class="detail-info">
          <span class="detail-type">Album</span>
          <h1 class="detail-title">${album.name || album.title}</h1>
          <div class="detail-meta">
            <span class="detail-artist font-semibold" style="color: var(--text-primary); cursor: pointer;" id="album-artist-link">${album.artist}</span>
            <span class="dot-separator"></span>
            <span>${yearStr}${songs.length} tracks • ${this.formatTotalDuration(totalDuration)}</span>
          </div>
          <div class="detail-actions">
            <button class="btn primary" id="album-play-btn">
              ${getIcon('play')} Play
            </button>
            <button class="btn secondary" id="album-fav-btn">
              ${getIcon(album.starred ? 'heartFilled' : 'heartOutline', album.starred ? 'active' : '')} 
              ${album.starred ? 'Starred' : 'Star Album'}
            </button>
          </div>
        </div>
      </div>

      <div class="track-list">
        ${this.buildTrackListHtml(songs, false)}
      </div>
    `;

    // Star Album listener
    const starBtn = document.getElementById('album-fav-btn');
    starBtn.addEventListener('click', async () => {
      const isStarred = album.starred;
      try {
        if (isStarred) {
          await api.unstar(album.id, true);
          album.starred = false;
        } else {
          await api.star(album.id, true);
          album.starred = true;
        }
        starBtn.innerHTML = `${getIcon(album.starred ? 'heartFilled' : 'heartOutline', album.starred ? 'active' : '')} ${album.starred ? 'Starred' : 'Star Album'}`;
      } catch (err) {
        console.error('Failed to star album:', err);
      }
    });

    // Play album listener
    document.getElementById('album-play-btn').addEventListener('click', () => {
      player.setQueue(songs, 0, true);
    });

    // Artist link listener
    if (album.artistId) {
      document.getElementById('album-artist-link').addEventListener('click', () => {
        this.navigateTo('artist', album.artistId);
      });
    }

    this.attachTrackEventListeners(songs);
  }

  async renderArtistDetail(artistId) {
    const res = await api.getArtist(artistId);
    const artist = res?.artist || {};
    const albums = artist.album || [];

    this.viewTitle.textContent = artist.name || 'Artist Detail';

    const artUrl = api.getCoverArtUrl(artist.id, 400);
    const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%231b1b22'/><text x='50%' y='55%' font-family='sans-serif' font-size='20' fill='%23555' text-anchor='middle'>Artist</text></svg>`;

    if (albums.length === 0) {
      this.contentArea.innerHTML = `
        <div class="detail-header">
          <div class="detail-cover" style="border-radius: 50%;">
            <img src="${artUrl}" onerror="this.src=\`${fallbackArt}\`" alt="${artist.name}">
          </div>
          <div class="detail-info">
            <span class="detail-type">Artist</span>
            <h1 class="detail-title">${artist.name}</h1>
          </div>
        </div>
        <div class="empty-state">
          <p>No albums found for this artist.</p>
        </div>
      `;
      return;
    }

    this.contentArea.innerHTML = `
      <div class="detail-header">
        <div class="detail-cover" style="border-radius: 50%;">
          <img src="${artUrl}" onerror="this.src=\`${fallbackArt}\`" alt="${artist.name}">
        </div>
        <div class="detail-info">
          <span class="detail-type">Artist</span>
          <h1 class="detail-title">${artist.name}</h1>
          <div class="detail-meta">
            <span>${albums.length} albums</span>
          </div>
          <div class="detail-actions">
            <button class="btn primary" id="artist-radio-btn">
              ${getIcon('play')} Artist Shuffle
            </button>
            <button class="btn secondary" id="artist-fav-btn">
              ${getIcon(artist.starred ? 'heartFilled' : 'heartOutline', artist.starred ? 'active' : '')}
              ${artist.starred ? 'Starred' : 'Star Artist'}
            </button>
          </div>
        </div>
      </div>

      <div class="home-section" style="margin-top: 32px;">
        <div class="section-header">
          <h2>Albums</h2>
        </div>
        <div class="card-grid">
          ${this.buildAlbumGridHtml(albums)}
        </div>
      </div>
    `;

    // Star Artist listener
    const starBtn = document.getElementById('artist-fav-btn');
    starBtn.addEventListener('click', async () => {
      const isStarred = artist.starred;
      try {
        if (isStarred) {
          await api.unstar(artist.id, false, true);
          artist.starred = false;
        } else {
          await api.star(artist.id, false, true);
          artist.starred = true;
        }
        starBtn.innerHTML = `${getIcon(artist.starred ? 'heartFilled' : 'heartOutline', artist.starred ? 'active' : '')} ${artist.starred ? 'Starred' : 'Star Artist'}`;
      } catch (err) {
        console.error('Failed to star artist:', err);
      }
    });

    // Artist Shuffle (fetch random songs from artist)
    document.getElementById('artist-radio-btn').addEventListener('click', async () => {
      try {
        // Fetch all tracks from artist's albums and shuffle them
        const allSongs = [];
        for (const album of albums) {
          const detail = await api.getAlbum(album.id);
          const songs = detail?.album?.song || [];
          allSongs.push(...songs);
        }

        if (allSongs.length > 0) {
          // Shuffle
          for (let i = allSongs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allSongs[i], allSongs[j]] = [allSongs[j], allSongs[i]];
          }
          player.setQueue(allSongs, 0, true);
        } else {
          alert('No tracks found for this artist.');
        }
      } catch (err) {
        console.error(err);
        alert('Failed to shuffle artist: ' + err.message);
      }
    });

    this.attachCardEventListeners();
  }

  async renderPlaylistDetail(playlistId) {
    const res = await api.getPlaylist(playlistId);
    const playlist = res?.playlist || {};
    const songs = playlist.entry || [];

    this.viewTitle.textContent = playlist.name || 'Playlist Detail';

    const artUrl = api.getCoverArtUrl(playlist.coverArt || playlist.id, 400);
    const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%23111'/></svg>`;

    const totalDuration = songs.reduce((total, s) => total + (s.duration || 0), 0);

    this.contentArea.innerHTML = `
      <div class="detail-header">
        <div class="detail-cover">
          <img src="${artUrl}" onerror="this.src=\`${fallbackArt}\`" alt="${playlist.name}">
        </div>
        <div class="detail-info">
          <span class="detail-type">Playlist</span>
          <h1 class="detail-title">${playlist.name}</h1>
          <div class="detail-meta">
            <span>By ${playlist.owner} • ${songs.length} tracks • ${this.formatTotalDuration(totalDuration)}</span>
          </div>
          <div class="detail-actions">
            <button class="btn primary" id="playlist-play-btn">
              ${getIcon('play')} Play
            </button>
          </div>
        </div>
      </div>

      <div class="track-list">
        ${this.buildTrackListHtml(songs, true)}
      </div>
    `;

    document.getElementById('playlist-play-btn').addEventListener('click', () => {
      player.setQueue(songs, 0, true);
    });

    this.attachTrackEventListeners(songs);
  }

  // HTML Builders
  buildAlbumGridHtml(albums) {
    return albums.map(album => {
      const artUrl = api.getCoverArtUrl(album.coverArt || album.id, 250);
      const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%231b1b22'/><text x='50%' y='55%' font-family='sans-serif' font-size='10' fill='%23555' text-anchor='middle'>Album</text></svg>`;

      return `
        <div class="album-card" data-album-id="${album.id}">
          <div class="album-art-wrapper">
            <img src="${artUrl}" onerror="this.src=\`${fallbackArt}\`" alt="${album.title}" loading="lazy">
            <button class="play-hover-btn album-quick-play-btn" data-album-play="${album.id}" title="Play Album">
              ${getIcon('play')}
            </button>
          </div>
          <span class="card-title">${album.title || album.name}</span>
          <span class="card-subtitle">${album.artist}</span>
        </div>
      `;
    }).join('');
  }

  buildTrackListHtml(songs, showArtwork = false) {
    if (songs.length === 0) return '<div class="no-results">No tracks available.</div>';

    const currentTrackId = player.currentTrack?.id;
    const isPlaying = player.isPlaying;

    return songs.map((song, index) => {
      const isActive = song.id === currentTrackId;
      const isStarred = song.starred;
      const artUrl = showArtwork ? api.getCoverArtUrl(song.coverArt || song.albumId, 80) : '';
      const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='100%' height='100%' fill='%23111'/></svg>`;

      return `
        <div class="track-row ${isActive ? 'active' : ''} ${isActive && isPlaying ? 'playing' : ''}" data-song-id="${song.id}" data-index="${index}">
          
          <div class="track-number">
            <span class="track-number-span">${index + 1}</span>
            <div class="eq-container">
              <div class="eq-bar"></div>
              <div class="eq-bar"></div>
              <div class="eq-bar"></div>
            </div>
          </div>

          ${showArtwork ? `<img class="track-art" src="${artUrl}" onerror="this.src=\`${fallbackArt}\`" alt="">` : ''}

          <div class="track-info">
            <div class="track-title">${song.title}</div>
            <div class="track-artist">${song.artist}</div>
          </div>

          <div class="track-album">${song.album || ''}</div>

          <div class="track-actions">
            <button class="icon-button fav-btn track-star-btn" data-star-id="${song.id}" title="Favorite">
              ${getIcon(isStarred ? 'heartFilled' : 'heartOutline', isStarred ? 'active' : '')}
            </button>
            <button class="icon-button track-queue-next-btn" data-queue-next="${song.id}" title="Play Next">
              ${getIcon('playNext')}
            </button>
            <button class="icon-button track-enqueue-btn" data-enqueue="${song.id}" title="Add to Queue">
              ${getIcon('plus')}
            </button>
          </div>

          <div class="track-duration">${this.formatTime(song.duration)}</div>
        </div>
      `;
    }).join('');
  }

  // Attach Event Listeners to rendered items
  attachCardEventListeners(parent = this.contentArea) {
    parent.querySelectorAll('.album-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.play-hover-btn')) return;
        const albumId = card.getAttribute('data-album-id');
        this.navigateTo('album', albumId);
      });
    });

    parent.querySelectorAll('.album-quick-play-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const albumId = btn.getAttribute('data-album-play');
        try {
          const detailRes = await api.getAlbum(albumId);
          const songs = detailRes?.album?.song || [];
          if (songs.length > 0) {
            player.setQueue(songs, 0, true);
          }
        } catch (err) {
          alert('Failed to play album: ' + err.message);
        }
      });
    });
  }

  attachTrackEventListeners(songs, parent = this.contentArea) {
    // Row click
    parent.querySelectorAll('.track-row').forEach(row => {
      row.addEventListener('click', (e) => {
        // Ignore clicks on action buttons
        if (e.target.closest('.track-actions') || e.target.closest('button')) return;
        
        const songId = row.getAttribute('data-song-id');
        const songIndex = parseInt(row.getAttribute('data-index'), 10);
        
        // Find track in current context list
        const track = songs.find(s => s.id === songId);
        
        if (track) {
          // If the song is already in the player queue, just jump to it
          const queueIndex = player.queue.findIndex(s => s.id === songId);
          if (queueIndex !== -1) {
            player.playTrackAt(queueIndex, true);
          } else {
            // Otherwise, load this tracklist as the active queue and play this track
            player.setQueue(songs, songIndex, true);
          }
        }
      });
    });

    // Star button click
    parent.querySelectorAll('.track-star-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const songId = btn.getAttribute('data-star-id');
        const song = songs.find(s => s.id === songId);
        if (!song) return;

        const isStarred = song.starred;
        try {
          if (isStarred) {
            await api.unstar(songId);
            song.starred = false;
          } else {
            await api.star(songId);
            song.starred = true;
          }
          btn.innerHTML = getIcon(song.starred ? 'heartFilled' : 'heartOutline', song.starred ? 'active' : '');
          
          // Sync if this is the currently playing track
          if (player.currentTrack?.id === songId) {
            player.currentTrack.starred = song.starred;
            this.updateFavBtn(song.starred);
          }
          
          if (this.currentView === 'starred') {
            this.refreshCurrentView();
          }
        } catch (err) {
          console.error(err);
        }
      });
    });

    // Play next
    parent.querySelectorAll('.track-queue-next-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const songId = btn.getAttribute('data-queue-next');
        const song = songs.find(s => s.id === songId);
        if (song) {
          player.enqueue(song, true);
          this.showToast(`"${song.title}" added to play next.`);
        }
      });
    });

    // Enqueue
    parent.querySelectorAll('.track-enqueue-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const songId = btn.getAttribute('data-enqueue');
        const song = songs.find(s => s.id === songId);
        if (song) {
          player.enqueue(song, false);
          this.showToast(`"${song.title}" added to queue.`);
        }
      });
    });
  }

  // Queue Panel Rendering
  renderQueueList(queue) {
    if (queue.length === 0) {
      this.queueList.innerHTML = '<div class="no-results" style="padding: 30px; text-align: center;">Queue is empty</div>';
      return;
    }

    const currentTrackId = player.currentTrack?.id;

    this.queueList.innerHTML = queue.map((song, index) => {
      const isActive = song.id === currentTrackId;
      const artUrl = api.getCoverArtUrl(song.coverArt || song.albumId, 80);
      const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'><rect width='100%' height='100%' fill='%23111'/></svg>`;

      return `
        <div class="queue-item ${isActive ? 'active' : ''}" data-queue-index="${index}">
          <img class="queue-item-art" src="${artUrl}" onerror="this.src=\`${fallbackArt}\`" alt="">
          <div class="queue-item-meta">
            <div class="queue-item-title">${song.title}</div>
            <div class="queue-item-artist">${song.artist}</div>
          </div>
          <button class="icon-button danger queue-item-remove" data-remove-index="${index}">
            ${getIcon('close')}
          </button>
        </div>
      `;
    }).join('');

    // Attach listeners
    this.queueList.querySelectorAll('.queue-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.queue-item-remove')) return;
        const index = parseInt(item.getAttribute('data-queue-index'), 10);
        player.playTrackAt(index, true);
      });
    });

    this.queueList.querySelectorAll('.queue-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.getAttribute('data-remove-index'), 10);
        player.removeFromQueue(index);
      });
    });
  }

  // Now Playing UI updates
  updateNowPlayingUI(track) {
    if (!track) {
      // Clear sidebar NOW playing
      this.sidebarTitle.textContent = 'Not Playing';
      this.sidebarArtist.textContent = '—';
      this.sidebarArt.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%231b1b22'/><text x='50%' y='55%' font-family='sans-serif' font-size='10' fill='%23555' text-anchor='middle'>No Track</text></svg>";
      this.updateFavBtn(false);

      // Clear mini NOW playing
      this.playerMiniTitle.textContent = 'Not Playing';
      this.playerMiniArtist.textContent = '—';
      this.playerMiniArt.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='100%' height='100%' fill='%23111'/></svg>";
      this.playBtn.innerHTML = getIcon('play');

      // Reset ambient canvas target
      this.setAmbientTargetColor({ r: 12, g: 12, b: 18 }, { r: 24, g: 24, b: 36 });
      return;
    }

    const coverArtUrl = api.getCoverArtUrl(track.coverArt || track.albumId, 400);
    const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%23111'/></svg>`;

    // Update Sidebar
    this.sidebarTitle.textContent = track.title;
    this.sidebarArtist.textContent = track.artist;
    this.sidebarArt.src = coverArtUrl;
    this.sidebarArt.onerror = () => this.sidebarArt.src = fallbackArt;
    this.updateFavBtn(track.starred);

    // Update Player Bar
    this.playerMiniTitle.textContent = track.title;
    this.playerMiniArtist.textContent = track.artist;
    this.playerMiniArt.src = coverArtUrl;
    this.playerMiniArt.onerror = () => this.playerMiniArt.src = fallbackArt;
    this.playBtn.innerHTML = getIcon(player.isPlaying ? 'pause' : 'play');

    // Highlight row in active lists
    document.querySelectorAll('.track-row').forEach(row => {
      const id = row.getAttribute('data-song-id');
      const isActive = id === track.id;
      row.classList.toggle('active', isActive);
      row.classList.toggle('playing', isActive && player.isPlaying);
    });

    // Update queue list active highlight
    document.querySelectorAll('.queue-item').forEach((item, idx) => {
      item.classList.toggle('active', idx === player.currentIndex);
    });

    // Dynamic Ambient Glow updating
    if (coverArtUrl) {
      this.extractCoverColors(coverArtUrl);
    }
  }

  updateFavBtn(isStarred) {
    this.sidebarFavBtn.innerHTML = getIcon(isStarred ? 'heartFilled' : 'heartOutline', isStarred ? 'active' : '');
    this.sidebarFavBtn.title = isStarred ? 'Unfavorite' : 'Favorite';
  }

  // Extract Colors from Album Art Cover
  extractCoverColors(imgUrl) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imgUrl;
    img.onload = () => {
      try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 10;
        tempCanvas.height = 10;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0, 10, 10);
        
        // Grab pixel samples for primary and secondary gradient nodes
        const p1 = tempCtx.getImageData(2, 2, 1, 1).data;
        const p2 = tempCtx.getImageData(8, 2, 1, 1).data;
        const p3 = tempCtx.getImageData(5, 8, 1, 1).data;
        
        const primary = { r: p1[0], g: p1[1], b: p1[2] };
        const secondary = { r: p2[0], g: p2[1], b: p2[2] };
        const tertiary = { r: p3[0], g: p3[1], b: p3[2] };

        // Soften colors so they aren't blinding in the background
        const soften = (c, factor = 0.5) => ({
          r: Math.round(c.r * factor),
          g: Math.round(c.g * factor),
          b: Math.round(c.b * factor)
        });

        this.setAmbientTargetColor(soften(primary, 0.45), soften(secondary, 0.45), soften(tertiary, 0.2));
      } catch (err) {
        // Fallback on cross-origin image read errors
        console.warn('CORS restriction on image color extraction, using defaults.');
        this.setAmbientTargetColor({ r: 50, g: 30, b: 90 }, { r: 90, g: 30, b: 50 });
      }
    };
    img.onerror = () => {
      this.setAmbientTargetColor({ r: 30, g: 30, b: 40 }, { r: 15, g: 15, b: 20 });
    };
  }

  setAmbientTargetColor(c1, c2, c3 = { r: 7, g: 7, b: 10 }) {
    this.targetColors.c1 = c1;
    this.targetColors.c2 = c2;
    this.targetColors.c3 = c3;
  }

  // Smooth color interpolation canvas loop
  startAmbientAnimation() {
    const animate = () => {
      // Linear interpolation factor
      const lerpVal = 0.02; 
      
      const lerp = (start, end) => start + (end - start) * lerpVal;

      // Morph current colors towards target colors
      for (const colorKey of ['c1', 'c2', 'c3']) {
        this.ambientColors[colorKey].r = lerp(this.ambientColors[colorKey].r, this.targetColors[colorKey].r);
        this.ambientColors[colorKey].g = lerp(this.ambientColors[colorKey].g, this.targetColors[colorKey].g);
        this.ambientColors[colorKey].b = lerp(this.ambientColors[colorKey].b, this.targetColors[colorKey].b);
      }

      const { c1, c2, c3 } = this.ambientColors;
      const rgb1 = `rgb(${Math.round(c1.r)}, ${Math.round(c1.g)}, ${Math.round(c1.b)})`;
      const rgb2 = `rgb(${Math.round(c2.r)}, ${Math.round(c2.g)}, ${Math.round(c2.b)})`;
      const rgb3 = `rgb(${Math.round(c3.r)}, ${Math.round(c3.g)}, ${Math.round(c3.b)})`;

      const w = this.canvas.width;
      const h = this.canvas.height;
      
      this.ctx.clearRect(0, 0, w, h);
      
      // Draw three shifting overlapping gradient points
      this.ambientAngle += 0.002;
      
      // Dynamic center positions drifting slowly in a circle
      const cx1 = w/2 + Math.cos(this.ambientAngle) * (w*0.15);
      const cy1 = h/2 + Math.sin(this.ambientAngle) * (h*0.15);
      const cx2 = w/2 + Math.cos(this.ambientAngle + Math.PI) * (w*0.2);
      const cy2 = h/2 + Math.sin(this.ambientAngle + Math.PI) * (h*0.2);

      // Color nodes radial gradient
      const grad1 = this.ctx.createRadialGradient(cx1, cy1, 10, cx1, cy1, w * 0.65);
      grad1.addColorStop(0, rgb1);
      grad1.addColorStop(1, 'rgba(7,7,10,0)');

      const grad2 = this.ctx.createRadialGradient(cx2, cy2, 10, cx2, cy2, w * 0.7);
      grad2.addColorStop(0, rgb2);
      grad2.addColorStop(1, 'rgba(7,7,10,0)');

      // Draw background base color
      this.ctx.fillStyle = rgb3;
      this.ctx.fillRect(0, 0, w, h);

      // Compositing overlapping circles
      this.ctx.globalCompositeOperation = 'screen';
      
      this.ctx.fillStyle = grad1;
      this.ctx.fillRect(0, 0, w, h);
      
      this.ctx.fillStyle = grad2;
      this.ctx.fillRect(0, 0, w, h);

      this.ctx.globalCompositeOperation = 'source-over';

      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  resizeCanvas() {
    this.canvas.width = this.canvas.parentElement.clientWidth;
    this.canvas.height = this.canvas.parentElement.clientHeight;
  }

  // Toast notifications helper
  showToast(message) {
    // If a toast already exists, remove it
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    
    // Style toast on the fly to avoid CSS bloat
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '110px',
      right: '24px',
      background: 'rgba(30, 30, 45, 0.95)',
      backdropFilter: 'blur(10px)',
      border: '1px solid var(--border-color)',
      color: 'white',
      padding: '12px 24px',
      borderRadius: '30px',
      fontSize: '13px',
      fontWeight: '600',
      zIndex: '2000',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      transform: 'translateY(20px)',
      opacity: '0',
      transition: 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)'
    });

    document.body.appendChild(toast);

    // Trigger animate-in
    setTimeout(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    }, 50);

    // Animate out and destroy
    setTimeout(() => {
      toast.style.transform = 'translateY(20px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // Utilities
  formatTime(secs) {
    if (isNaN(secs)) return '0:00';
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  formatTotalDuration(secs) {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    if (hours > 0) {
      return `${hours} hr ${minutes} min`;
    }
    return `${minutes} min`;
  }
}

export const ui = new UI();
export default ui;
