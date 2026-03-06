// ==================== LEADERBOARD PAGE ====================

let currentOffset = 0;
const PAGE_SIZE = 50;
let hasMore = true;
let tournamentId = null;
let tournamentData = null;

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  tournamentId = params.get('tournamentId');
  
  if (tournamentId) {
    // Tournament-specific mode
    const filtersContainer = document.getElementById('filtersContainer');
    if (filtersContainer) filtersContainer.classList.add('hidden');
    await loadTournamentLeaderboard();
  } else {
    // Global leaderboard mode
    setupFilters();
    setupEventListeners();
    await loadLeaderboard();
  }
});

function setupEventListeners() {
  const applyBtn = document.getElementById('applyFilters');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const stateFilter = document.getElementById('stateFilter');
  
  if (applyBtn) {
    applyBtn.addEventListener('click', () => loadLeaderboard(false));
  }
  
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => loadLeaderboard(true));
  }
  
  if (stateFilter) {
    stateFilter.addEventListener('change', updateDistrictOptions);
  }
}

function setupFilters() {
  const stateSelect = document.getElementById('stateFilter');
  
  // Populate states from districts.js (assumes window.statesAndDistricts exists)
  if (stateSelect && typeof statesAndDistricts !== 'undefined') {
    Object.keys(statesAndDistricts).sort().forEach(state => {
      const opt = document.createElement('option');
      opt.value = state;
      opt.textContent = state;
      stateSelect.appendChild(opt);
    });
  }
}

function updateDistrictOptions() {
  const state = document.getElementById('stateFilter').value;
  const districtSelect = document.getElementById('districtFilter');
  
  if (!districtSelect) return;
  
  districtSelect.innerHTML = '<option value="">All Districts</option>';
  
  if (state && typeof statesAndDistricts !== 'undefined' && statesAndDistricts[state]) {
    statesAndDistricts[state].sort().forEach(district => {
      const opt = document.createElement('option');
      opt.value = district;
      opt.textContent = district;
      districtSelect.appendChild(opt);
    });
  }
}

function clearFilters() {
  const sportFilter = document.getElementById('sportFilter');
  const stateFilter = document.getElementById('stateFilter');
  const districtFilter = document.getElementById('districtFilter');
  
  if (sportFilter) sportFilter.value = '';
  if (stateFilter) stateFilter.value = '';
  if (districtFilter) districtFilter.value = '';
  
  updateDistrictOptions();
  loadLeaderboard(false);
}

// ==================== GLOBAL LEADERBOARD ====================

async function loadLeaderboard(append = false) {
  if (!append) {
    currentOffset = 0;
    const playersList = document.getElementById('playersList');
    if (playersList) playersList.innerHTML = '';
  }
  
  showLoadingState(true);
  
  try {
    const sportFilter = document.getElementById('sportFilter');
    const stateFilter = document.getElementById('stateFilter');
    const districtFilter = document.getElementById('districtFilter');
    
    const params = {
      sport: sportFilter?.value || undefined,
      state: stateFilter?.value || undefined,
      district: districtFilter?.value || undefined,
      limit: PAGE_SIZE,
      offset: currentOffset
    };
    
    // Remove undefined values
    Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
    
    const data = await getGlobalLeaderboard(params);
    
    hasMore = data.length === PAGE_SIZE;
    currentOffset += data.length;
    
    if (data.length === 0 && !append) {
      showEmptyState();
    } else {
      renderGlobalLeaderboard(data, append);
    }
    
    // Update results info
    const resultsInfo = document.getElementById('resultsInfo');
    if (resultsInfo) {
      resultsInfo.textContent = `Showing ${currentOffset} players`;
      resultsInfo.classList.remove('hidden');
    }
    
    // Load more button visibility
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    if (loadMoreContainer) {
      loadMoreContainer.classList.toggle('hidden', !hasMore);
    }
    
  } catch (error) {
    console.error('Load error:', error);
    showErrorState(error.message);
  } finally {
    showLoadingState(false);
  }
}

function renderGlobalLeaderboard(players, append) {
  hideAllStates();
  
  const leaderboardContainer = document.getElementById('leaderboardContainer');
  const playersList = document.getElementById('playersList');
  
  if (leaderboardContainer) leaderboardContainer.classList.remove('hidden');
  if (!playersList) return;
  
  players.forEach((player, index) => {
    const rank = append ? currentOffset - players.length + index + 1 : (player.rank || index + 1);
    const row = document.createElement('div');
    row.className = 'flex items-center gap-4 p-4 border-b border-gray-100 hover:bg-blue-50 transition';
    
    // Medal styling for top 3
    let rankDisplay = String(rank);
    let rankClass = 'text-gray-600';
    if (rank === 1) { rankDisplay = '🥇'; rankClass = 'text-2xl'; }
    else if (rank === 2) { rankDisplay = '🥈'; rankClass = 'text-2xl'; }
    else if (rank === 3) { rankDisplay = '🥉'; rankClass = 'text-2xl'; }
    
    const location = [player.district, player.state].filter(Boolean).join(', ') || '-';
    const displayName = escapeHtml(player.name || player.username);
    const profilePic = player.profilePic || '/img/defaultavatar.jpg';
    
    row.innerHTML = `
      <div class="w-12 text-center font-bold ${rankClass}">${rankDisplay}</div>
      <img src="${escapeHtml(profilePic)}" 
        onerror="handleImageError(this)"
        class="w-10 h-10 rounded-full object-cover" alt="">
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-gray-800 truncate">${displayName}</p>
        <p class="text-sm text-gray-500 truncate">${escapeHtml(player.sport || '-')} • ${escapeHtml(location)}</p>
      </div>
      <div class="text-right">
        <p class="text-xl font-bold text-blue-600">${player.impactScore ?? 0}</p>
        <p class="text-xs text-gray-400">Impact Score</p>
      </div>
    `;
    
    playersList.appendChild(row);
  });
}

// ==================== TOURNAMENT LEADERBOARD ====================

async function loadTournamentLeaderboard() {
  showLoadingState(true);
  
  try {
    // Fetch tournament name
    const subtitle = document.getElementById('leaderboardSubtitle');
    try {
      tournamentData = await getTournamentDetails(tournamentId);
      if (subtitle) {
        subtitle.textContent = `${escapeHtml(tournamentData.name)} - Tournament Rankings`;
      }
    } catch (e) {
      if (subtitle) subtitle.textContent = 'Tournament Rankings';
    }
    
    const data = await getTournamentLeaderboard(tournamentId);
    
    if (data.length === 0) {
      showEmptyState();
      const emptyState = document.getElementById('emptyState');
      const emptyText = emptyState?.querySelector('p');
      if (emptyText) emptyText.textContent = 'No player statistics recorded yet.';
    } else {
      renderTournamentLeaderboard(data);
    }
    
  } catch (error) {
    console.error('Load error:', error);
    showErrorState(error.message);
  } finally {
    showLoadingState(false);
  }
}

function renderTournamentLeaderboard(players) {
  hideAllStates();
  
  const leaderboardContainer = document.getElementById('leaderboardContainer');
  const playersList = document.getElementById('playersList');
  
  if (leaderboardContainer) leaderboardContainer.classList.remove('hidden');
  if (!playersList) return;
  
  playersList.innerHTML = '';
  
  players.forEach((player, index) => {
    const rank = player.rank || index + 1;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-4 p-4 border-b border-gray-100 hover:bg-blue-50 transition';
    
    let rankDisplay = String(rank);
    let rankClass = 'text-gray-600';
    if (rank === 1) { rankDisplay = '🥇'; rankClass = 'text-2xl'; }
    else if (rank === 2) { rankDisplay = '🥈'; rankClass = 'text-2xl'; }
    else if (rank === 3) { rankDisplay = '🥉'; rankClass = 'text-2xl'; }
    
    const displayName = escapeHtml(player.username || 'Player');
    const profilePic = player.profilePic || '/img/defaultavatar.jpg';
    
    row.innerHTML = `
      <div class="w-12 text-center font-bold ${rankClass}">${rankDisplay}</div>
      <img src="${escapeHtml(profilePic)}" 
        onerror="handleImageError(this)"
        class="w-10 h-10 rounded-full object-cover" alt="">
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-gray-800 truncate">${displayName}</p>
        <p class="text-sm text-gray-500">
          ${player.matchesPlayed ?? 0} matches • ${player.matchesWon ?? 0} won
        </p>
      </div>
      <div class="text-right">
        <p class="text-lg font-bold text-green-600">${player.totalRuns ?? 0}</p>
        <p class="text-xs text-gray-400">Runs</p>
      </div>
      <div class="text-right">
        <p class="text-lg font-bold text-purple-600">${player.totalWickets ?? 0}</p>
        <p class="text-xs text-gray-400">Wickets</p>
      </div>
    `;
    
    playersList.appendChild(row);
  });
}

// ==================== STATE MANAGEMENT ====================

function hideAllStates() {
  const states = ['loadingState', 'errorState', 'emptyState', 'leaderboardContainer', 'resultsInfo', 'loadMoreContainer'];
  states.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function showLoadingState(show) {
  const loadingState = document.getElementById('loadingState');
  if (loadingState) {
    if (show) {
      hideAllStates();
      loadingState.classList.remove('hidden');
    } else {
      loadingState.classList.add('hidden');
    }
  }
}

function showErrorState(message) {
  hideAllStates();
  const errorState = document.getElementById('errorState');
  const errorMessage = document.getElementById('errorMessage');
  if (errorState) errorState.classList.remove('hidden');
  if (errorMessage) errorMessage.textContent = message;
}

function showEmptyState() {
  hideAllStates();
  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.classList.remove('hidden');
}

// ==================== GLOBAL FUNCTIONS ====================
window.clearFilters = clearFilters;
window.loadLeaderboard = loadLeaderboard;