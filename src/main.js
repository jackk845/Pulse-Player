import api from './api.js';
import player from './player.js';
import ui from './ui.js';

// Application entry point and bootstrapper
async function bootstrap() {
  console.log('Bootstrapping Pulse Player...');

  // 1. Check if server settings exist
  if (!api.hasCredentials()) {
    ui.updateStatus('error', 'Not Connected');
    ui.renderEmptyState('plug', 'Not Connected', 'Click Settings in the sidebar to configure your Navidrome server.');
    
    // Automatically trigger settings modal for first-time setup
    setTimeout(() => {
      ui.openSettingsModal();
    }, 400);
    return;
  }

  // 2. We have credentials: try connecting
  ui.updateStatus('connecting', 'Connecting...');
  
  try {
    await api.ping();
    
    // Connectivity successful
    ui.updateStatus('connected', 'Connected');
    console.log(`Connected successfully to ${api.serverUrl} as user ${api.username}`);
    
    // Load home page view
    ui.navigateTo('home');
    
    // Restore player queue UI if previous tracks were loaded
    if (player.queue.length > 0) {
      ui.renderQueueList(player.queue);
      ui.updateNowPlayingUI(player.currentTrack);
    }
  } catch (err) {
    console.error('Failed to auto-connect to Navidrome server:', err);
    ui.updateStatus('error', 'Connection Error');
    ui.showToast('Failed to connect. Verify your server URL and login credentials.');
    
    // Render connection error landing state
    ui.renderEmptyState(
      'close', 
      'Connection Failure', 
      `Unable to reach server at ${api.serverUrl}. <br><small style="color: var(--text-muted);">${err.message || ''}</small>`
    );
    
    // Automatically bring up the credential sheet to assist correction
    setTimeout(() => {
      ui.openSettingsModal();
    }, 800);
  }
}

// Start booting up when DOM is fully prepared
document.addEventListener('DOMContentLoaded', bootstrap);
