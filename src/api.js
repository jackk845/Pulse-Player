import md5 from 'blueimp-md5';

class NavidromeAPI {
  constructor() {
    this.serverUrl = localStorage.getItem('pulse_server_url') || '';
    this.username = localStorage.getItem('pulse_username') || '';
    this.password = localStorage.getItem('pulse_password') || '';
    this.clientName = 'pulse';
    this.apiVersion = '1.16.1';
  }

  setCredentials(serverUrl, username, password) {
    let normalizedUrl = serverUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'http://' + normalizedUrl;
    }
    if (!normalizedUrl.endsWith('/')) {
      normalizedUrl += '/';
    }
    
    this.serverUrl = normalizedUrl;
    this.username = username.trim();
    this.password = password;

    localStorage.setItem('pulse_server_url', this.serverUrl);
    localStorage.setItem('pulse_username', this.username);
    localStorage.setItem('pulse_password', this.password);
  }

  clearCredentials() {
    this.serverUrl = '';
    this.username = '';
    this.password = '';
    localStorage.removeItem('pulse_server_url');
    localStorage.removeItem('pulse_username');
    localStorage.removeItem('pulse_password');
  }

  hasCredentials() {
    return this.serverUrl && this.username && this.password;
  }

  generateAuthParams() {
    const salt = Math.random().toString(36).substring(2, 10);
    const token = md5(this.password + salt);
    return {
      u: this.username,
      s: salt,
      t: token,
      v: this.apiVersion,
      c: this.clientName,
      f: 'json'
    };
  }

  async request(endpoint, params = {}) {
    if (!this.hasCredentials()) {
      throw new Error('Credentials not set');
    }

    const authParams = this.generateAuthParams();
    const allParams = { ...authParams, ...params };
    
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    const url = new URL(cleanEndpoint, this.serverUrl);
    
    Object.keys(allParams).forEach(key => {
      if (Array.isArray(allParams[key])) {
        allParams[key].forEach(val => url.searchParams.append(key, val));
      } else {
        url.searchParams.set(key, allParams[key]);
      }
    });

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      const subsonicResponse = data['subsonic-response'];
      if (!subsonicResponse) {
        throw new Error('Invalid Subsonic API response format');
      }

      if (subsonicResponse.status === 'failed') {
        const error = subsonicResponse.error || { code: 0, message: 'Unknown error' };
        throw new Error(`Subsonic API Error: ${error.message} (Code: ${error.code})`);
      }

      return subsonicResponse;
    } catch (err) {
      console.error(`Request to ${endpoint} failed:`, err);
      throw err;
    }
  }

  getStreamUrl(songId) {
    if (!this.hasCredentials()) return '';
    const authParams = this.generateAuthParams();
    const url = new URL('rest/stream.view', this.serverUrl);
    
    const params = { ...authParams, id: songId };
    Object.keys(params).forEach(key => url.searchParams.set(key, params[key]));
    
    return url.toString();
  }

  getCoverArtUrl(coverArtId, size = 300) {
    if (!this.hasCredentials() || !coverArtId) return '';
    const authParams = this.generateAuthParams();
    const url = new URL('rest/getCoverArt.view', this.serverUrl);
    
    const params = { ...authParams, id: coverArtId, size: size };
    Object.keys(params).forEach(key => url.searchParams.set(key, params[key]));
    
    return url.toString();
  }

  async ping() {
    return this.request('rest/ping.view');
  }

  async getAlbumList(type = 'newest', limit = 50, offset = 0) {
    return this.request('rest/getAlbumList2.view', { type, size: limit, offset });
  }

  async getArtists() {
    return this.request('rest/getArtists.view');
  }

  async getArtist(artistId) {
    return this.request('rest/getArtist.view', { id: artistId });
  }

  async getAlbum(albumId) {
    return this.request('rest/getAlbum.view', { id: albumId });
  }

  async getPlaylists() {
    return this.request('rest/getPlaylists.view');
  }

  async getPlaylist(playlistId) {
    return this.request('rest/getPlaylist.view', { id: playlistId });
  }

  async getStarred() {
    return this.request('rest/getStarred2.view');
  }

  async star(id, isAlbum = false, isArtist = false) {
    const params = {};
    if (isAlbum) params.albumId = id;
    else if (isArtist) params.artistId = id;
    else params.id = id;
    return this.request('rest/star.view', params);
  }

  async unstar(id, isAlbum = false, isArtist = false) {
    const params = {};
    if (isAlbum) params.albumId = id;
    else if (isArtist) params.artistId = id;
    else params.id = id;
    return this.request('rest/unstar.view', params);
  }

  async search(query, limit = 50) {
    return this.request('rest/search3.view', { query, artistCount: limit, albumCount: limit, songCount: limit });
  }

  async scrobble(id, submission = false) {
    return this.request('rest/scrobble.view', { id, submission });
  }
}

export const api = new NavidromeAPI();
export default api;
