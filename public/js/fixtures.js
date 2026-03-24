import { getCurrentUser } from "./modules/users.js";

// ==================== FIXTURES PAGE ====================

let tournamentId = null;
let tournamentData = null;
let fixturesData = [];

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', async () => {
  // Role guard - Admin only
  const user = getCurrentUser() || {};
  if (!user || user.role !== 'Admin') {
    alert('Access denied. Admin only.');
    window.location.href = '/dashboard.html';
    return;
  }

  // Get tournament ID from URL
  const params = new URLSearchParams(window.location.search);
  tournamentId = params.get('id');
  
  if (!tournamentId) {
    showErrorState('No tournament ID provided');
    return;
  }

  setupEventListeners();
  await loadTournamentAndFixtures();
});

function setupEventListeners() {
  // Generate button opens confirmation modal
  const generateBtn = document.getElementById('generateBtn');
  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      const confirmModal = document.getElementById('confirmModal');
      if (confirmModal) confirmModal.showModal();
    });
  }
  
  // Confirmation modal buttons
  const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
  const confirmGenerateBtn = document.getElementById('confirmGenerateBtn');
  
  if (cancelConfirmBtn) {
    cancelConfirmBtn.addEventListener('click', () => {
      document.getElementById('confirmModal').close();
    });
  }
  
  if (confirmGenerateBtn) {
    confirmGenerateBtn.addEventListener('click', handleGenerateFixtures);
  }
  
  // Score modal
  const cancelScoreBtn = document.getElementById('cancelScoreBtn');
  const scoreForm = document.getElementById('scoreForm');
  
  if (cancelScoreBtn) {
    cancelScoreBtn.addEventListener('click', () => {
      document.getElementById('scoreModal').close();
    });
  }
  
  if (scoreForm) {
    scoreForm.addEventListener('submit', handleScoreSubmit);
  }
  
  // Auto-suggest winner when scores change
  const scoreA = document.getElementById('scoreA');
  const scoreB = document.getElementById('scoreB');
  const winner = document.getElementById('winner');
  
  if (scoreA) scoreA.addEventListener('input', autoSuggestWinner);
  if (scoreB) scoreB.addEventListener('input', autoSuggestWinner);
  if (winner) winner.addEventListener('change', validateScoreInputs);
  
  // Stats modal
  const cancelStatsBtn = document.getElementById('cancelStatsBtn');
  const statsForm = document.getElementById('statsForm');
  
  if (cancelStatsBtn) {
    cancelStatsBtn.addEventListener('click', () => {
      document.getElementById('statsModal').close();
    });
  }
  
  if (statsForm) {
    statsForm.addEventListener('submit', handleStatsSubmit);
  }
  
  // View leaderboard button
  const viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn');
  if (viewLeaderboardBtn) {
    viewLeaderboardBtn.addEventListener('click', () => {
      window.location.href = `/leaderboard.html?tournamentId=${tournamentId}`;
    });
  }
  
  // Advance round button
  const advanceRoundBtn = document.getElementById('advanceRoundBtn');
  if (advanceRoundBtn) {
    advanceRoundBtn.addEventListener('click', handleAdvanceRound);
  }
}

// ==================== DATA LOADING ====================

async function loadTournamentAndFixtures() {
  showLoadingState(true);
  hideAllStates();
  
  try {
    // Fetch tournament details
    tournamentData = await getTournamentDetails(tournamentId);
    updateTournamentHeader();
    
    // Fetch fixtures
    fixturesData = await getFixtures(tournamentId);
    
    if (fixturesData.length === 0) {
      showEmptyState();
    } else {
      renderFixtures();
    }
  } catch (error) {
    console.error('Load error:', error);
    showErrorState(error.message || 'Failed to load tournament data');
  } finally {
    showLoadingState(false);
  }
}

function updateTournamentHeader() {
  const pageTitle = document.getElementById('pageTitle');
  const tournamentInfo = document.getElementById('tournamentInfo');
  
  if (pageTitle) {
    pageTitle.textContent = escapeHtml(tournamentData?.name) || 'Tournament Fixtures';
  }
  
  if (tournamentInfo) {
    const info = [
      tournamentData?.sport,
      tournamentData?.venue,
      tournamentData?.status
    ].filter(Boolean).join(' • ');
    tournamentInfo.textContent = info;
  }
}

// ==================== RENDERING ====================

function renderFixtures() {
  hideAllStates();
  const container = document.getElementById('fixturesContainer');
  if (container) container.classList.remove('hidden');
  
  // Update match count
  const completed = fixturesData.filter(m => m.status === 'COMPLETED').length;
  const matchCount = document.getElementById('matchCount');
  if (matchCount) {
    matchCount.textContent = `${completed}/${fixturesData.length} matches completed`;
  }
  
  // Group by round
  const rounds = {};
  fixturesData.forEach(match => {
    if (!rounds[match.round]) rounds[match.round] = [];
    rounds[match.round].push(match);
  });
  
  // Render rounds
  const roundsContainer = document.getElementById('roundsContainer');
  if (!roundsContainer) return;
  
  roundsContainer.innerHTML = '';
  
  const roundNames = { 1: 'Round 1', 2: 'Quarter Finals', 3: 'Semi Finals', 4: 'Final' };
  
  Object.keys(rounds).sort((a, b) => Number(a) - Number(b)).forEach(roundNum => {
    const roundDiv = document.createElement('div');
    roundDiv.className = 'bg-white rounded-lg shadow overflow-hidden mb-4';
    
    const roundName = roundNames[roundNum] || `Round ${roundNum}`;
    roundDiv.innerHTML = `
      <div class="bg-gray-100 px-4 py-3 border-b">
        <h3 class="font-semibold text-gray-800">${roundName}</h3>
      </div>
      <div class="divide-y" id="round-${roundNum}-matches"></div>
    `;
    
    roundsContainer.appendChild(roundDiv);
    
    const matchesContainer = document.getElementById(`round-${roundNum}-matches`);
    rounds[roundNum].forEach(match => {
      matchesContainer.appendChild(createMatchCard(match));
    });
  });

  // Manage "Advance Round" button visibility
  const advanceBtn = document.getElementById('advanceRoundBtn');
  if (advanceBtn && fixturesData.length > 0) {
    const roundNumbers = Object.keys(rounds).map(Number);
    const latestRound = Math.max(...roundNumbers);
    const latestMatches = rounds[latestRound] || [];
    const allCompleted = latestMatches.every(m => m.status === 'COMPLETED');
    
    // Show if all completed and we have more than 1 match in the round (meaning it's not the final)
    if (allCompleted && latestMatches.length > 1) {
      advanceBtn.classList.remove('hidden');
    } else {
      advanceBtn.classList.add('hidden');
    }
  }
}

function createMatchCard(match) {
  const div = document.createElement('div');
  div.className = 'p-4';
  div.id = `match-${match.id}`;
  
  const isBye = match.teamB === 'BYE';
  const isCompleted = match.status === 'COMPLETED';
  
  // Winner styling
  let teamAClass = 'text-gray-800';
  let teamBClass = 'text-gray-800';
  if (isCompleted) {
    if (match.winner === 'A') {
      teamAClass = 'text-green-600 font-bold';
      teamBClass = 'text-gray-400';
    } else if (match.winner === 'B') {
      teamBClass = 'text-green-600 font-bold';
      teamAClass = 'text-gray-400';
    }
  }
  
  const teamAName = escapeHtml(match.teamA);
  const teamBName = isBye 
    ? '<span class="bg-gray-200 text-gray-600 px-2 py-1 rounded text-xs">BYE</span>' 
    : escapeHtml(match.teamB);
  
  div.innerHTML = `
    <div class="flex items-center gap-4 ${isBye ? 'opacity-60' : ''}">
      <div class="flex-1 space-y-2">
        <div class="flex items-center justify-between">
          <span class="${teamAClass}">${teamAName}</span>
          <span class="text-xl font-bold w-12 text-center">${match.scoreA ?? '-'}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="${teamBClass}">${teamBName}</span>
          <span class="text-xl font-bold w-12 text-center">${match.scoreB ?? '-'}</span>
        </div>
      </div>
      <div class="flex flex-col gap-2 min-w-[100px]">
        ${isBye ? '<span class="text-xs text-gray-500 text-center">Auto-Advanced</span>' : ''}
        ${!isBye && !isCompleted ? `
          <button onclick="openScoreModal('${match.id}', '${escapeHtml(match.teamA)}', '${escapeHtml(match.teamB)}')"
            class="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition">
            Enter Score
          </button>
        ` : ''}
        ${isCompleted && !isBye ? `
          <button onclick="openStatsModal('${match.id}', '${escapeHtml(match.teamA)}', '${match.teamAId || ''}', '${escapeHtml(match.teamB)}', '${match.teamBId || ''}')"
            class="bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 transition">
            Add Stats
          </button>
          <span class="text-xs text-gray-500 text-center">✓ Completed</span>
        ` : ''}
      </div>
    </div>
  `;
  
  return div;
}

// ==================== STATE MANAGEMENT ====================

function hideAllStates() {
  const states = ['loadingState', 'errorState', 'emptyState', 'fixturesContainer'];
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

// ==================== GENERATE FIXTURES ====================

async function handleGenerateFixtures() {
  const btn = document.getElementById('confirmGenerateBtn');
  if (btn) setButtonLoading(btn, true, 'Generate');
  
  try {
    await generateFixtures(tournamentId);
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) confirmModal.close();
    await loadTournamentAndFixtures();
  } catch (error) {
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) confirmModal.close();
    const generateError = document.getElementById('generateError');
    if (generateError) {
      generateError.textContent = error.message;
      generateError.classList.remove('hidden');
    }
    showEmptyState();
  } finally {
    if (btn) setButtonLoading(btn, false, 'Generate');
  }
}

// ==================== ADVANCE ROUND ====================

async function handleAdvanceRound() {
  const btn = document.getElementById('advanceRoundBtn');
  const originalText = btn.textContent;
  if (btn) btn.textContent = 'Advancing...';
  try {
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/advance-round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to advance round');
    await loadTournamentAndFixtures();
  } catch (error) {
    alert(error.message);
  } finally {
    if (btn) btn.textContent = originalText;
  }
}

// ==================== SCORE ENTRY ====================

function openScoreModal(matchId, teamA, teamB) {
  document.getElementById('scoreMatchId').value = matchId;
  document.getElementById('modalMatchInfo').textContent = `${teamA} vs ${teamB}`;
  document.getElementById('teamALabel').textContent = teamA;
  document.getElementById('teamBLabel').textContent = teamB;
  
  // Reset form
  document.getElementById('scoreForm').reset();
  const validationError = document.getElementById('scoreValidationError');
  if (validationError) validationError.classList.add('hidden');
  
  document.getElementById('scoreModal').showModal();
}

function autoSuggestWinner() {
  const scoreA = parseNumberOrNull(document.getElementById('scoreA').value);
  const scoreB = parseNumberOrNull(document.getElementById('scoreB').value);
  const winnerSelect = document.getElementById('winner');
  
  if (scoreA !== null && scoreB !== null) {
    if (scoreA > scoreB) {
      winnerSelect.value = 'A';
    } else if (scoreB > scoreA) {
      winnerSelect.value = 'B';
    } else {
      winnerSelect.value = 'DRAW';
    }
  }
  
  validateScoreInputs();
}

function validateScoreInputs() {
  const scoreA = parseNumberOrNull(document.getElementById('scoreA').value);
  const scoreB = parseNumberOrNull(document.getElementById('scoreB').value);
  const winner = document.getElementById('winner').value;
  
  const errorEl = document.getElementById('scoreValidationError');
  let error = null;
  
  if (winner && scoreA !== null && scoreB !== null) {
    if (winner === 'A' && scoreA <= scoreB) {
      error = 'Team A must have higher score to win';
    } else if (winner === 'B' && scoreB <= scoreA) {
      error = 'Team B must have higher score to win';
    } else if (winner === 'DRAW' && scoreA !== scoreB) {
      error = 'Draw requires equal scores';
    }
  }
  
  if (errorEl) {
    if (error) {
      errorEl.textContent = error;
      errorEl.classList.remove('hidden');
    } else {
      errorEl.classList.add('hidden');
    }
  }
  
  return !error;
}

async function handleScoreSubmit(e) {
  e.preventDefault();
  
  if (!validateScoreInputs()) return;
  
  const btn = document.getElementById('submitScoreBtn');
  if (btn) setButtonLoading(btn, true, 'Save Score');
  
  const matchId = document.getElementById('scoreMatchId').value;
  const data = {
    scoreA: parseNumberOrNull(document.getElementById('scoreA').value),
    scoreB: parseNumberOrNull(document.getElementById('scoreB').value),
    winner: document.getElementById('winner').value
  };
  
  try {
    await updateMatchScore(matchId, data);
    document.getElementById('scoreModal').close();
    await loadTournamentAndFixtures();
  } catch (error) {
    const errorEl = document.getElementById('scoreValidationError');
    if (errorEl) {
      errorEl.textContent = error.message;
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (btn) setButtonLoading(btn, false, 'Save Score');
  }
}

// ==================== PLAYER STATS ====================

function openStatsModal(matchId, teamA, teamAId, teamB, teamBId) {
  document.getElementById('statsMatchId').value = matchId;
  document.getElementById('statsModalMatchInfo').textContent = `${teamA} vs ${teamB}`;
  
  // Populate player dropdown
  const select = document.getElementById('statsPlayerId');
  select.innerHTML = '<option value="">Choose player...</option>';
  
  if (teamAId && teamAId !== 'null' && teamAId !== 'undefined') {
    const opt = document.createElement('option');
    opt.value = teamAId;
    opt.textContent = teamA;
    select.appendChild(opt);
  }
  
  if (teamBId && teamBId !== 'null' && teamBId !== 'undefined') {
    const opt = document.createElement('option');
    opt.value = teamBId;
    opt.textContent = teamB;
    select.appendChild(opt);
  }
  
  // Reset form
  document.getElementById('statsForm').reset();
  const statsError = document.getElementById('statsError');
  const statsSuccess = document.getElementById('statsSuccess');
  if (statsError) statsError.classList.add('hidden');
  if (statsSuccess) statsSuccess.classList.add('hidden');
  
  document.getElementById('statsModal').showModal();
}

async function handleStatsSubmit(e) {
  e.preventDefault();
  
  const playerId = document.getElementById('statsPlayerId').value;
  const statsError = document.getElementById('statsError');
  
  if (!playerId) {
    if (statsError) {
      statsError.textContent = 'Please select a player';
      statsError.classList.remove('hidden');
    }
    return;
  }
  
  const btn = document.getElementById('submitStatsBtn');
  if (btn) setButtonLoading(btn, true, 'Save Stats');
  
  const matchId = document.getElementById('statsMatchId').value;
  const data = {
    playerId,
    battingRuns: parseNumberOrNull(document.getElementById('battingRuns').value),
    bowlingWickets: parseNumberOrNull(document.getElementById('bowlingWickets').value),
    catches: parseNumberOrNull(document.getElementById('catches').value),
    runOuts: parseNumberOrNull(document.getElementById('runOuts').value)
  };
  
  // Remove null values except playerId
  Object.keys(data).forEach(key => {
    if (data[key] === null && key !== 'playerId') delete data[key];
  });
  
  try {
    await addPlayerMatchStats(matchId, data);
    
    const statsSuccess = document.getElementById('statsSuccess');
    if (statsSuccess) {
      statsSuccess.textContent = 'Stats saved successfully!';
      statsSuccess.classList.remove('hidden');
    }
    
    setTimeout(() => {
      document.getElementById('statsModal').close();
    }, 1000);
  } catch (error) {
    if (statsError) {
      statsError.textContent = error.message;
      statsError.classList.remove('hidden');
    }
  } finally {
    if (btn) setButtonLoading(btn, false, 'Save Stats');
  }
}

// ==================== GLOBAL FUNCTIONS ====================
window.openScoreModal = openScoreModal;
window.openStatsModal = openStatsModal;