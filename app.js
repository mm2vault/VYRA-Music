const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const YOUTUBE_API_KEY = "AIzaSyAPcOxJ9CBs75V-WSXg7v0YnYW-FAuCxe8";

let current = null;
let screenTrack = null;
let queue = [];
let queueIndex = -1;
let favs = [];
let history = [];
let lists = [];
let activePlaylistId = null;
let pickerTrack = null;
let player = null;
let playerReady = false;
let playing = false;
let progressTimer = null;
let searchType = "songs";

function safeJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value;
  } catch {
    return fallback;
  }
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function loadState() {
  favs = normalizeArray(safeJson("vyraFavs", []));
  history = normalizeArray(safeJson("vyraHistory", []));
  const rawLists = normalizeArray(safeJson("vyraLists", []));
  lists = rawLists.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: "pl_" + Date.now() + "_" + index,
        name: item,
        tracks: []
      };
    }
    return {
      id: item?.id || "pl_" + Date.now() + "_" + index,
      name: item?.name || "Yeni liste",
      tracks: normalizeArray(item?.tracks)
    };
  });
}

function saveState() {
  localStorage.setItem("vyraFavs", JSON.stringify(favs));
  localStorage.setItem("vyraHistory", JSON.stringify(history));
  localStorage.setItem("vyraLists", JSON.stringify(lists));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(window.__vyraToastTimer);
  window.__vyraToastTimer = setTimeout(() => node.classList.remove("show"), 2200);
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

function isApiConfigured() {
  return Boolean(YOUTUBE_API_KEY && !YOUTUBE_API_KEY.includes("YOUR_"));
}

function normalizeTrack(track) {
  if (!track?.id) return null;
  return {
    id: String(track.id),
    title: String(track.title || "Bilinmeyen şarkı"),
    artist: String(track.artist || "YouTube"),
    thumbnail: String(track.thumbnail || ""),
    publishedAt: track.publishedAt || ""
  };
}

function trackFromSearchItem(item) {
  const snippet = item?.snippet || {};
  return normalizeTrack({
    id: item?.id?.videoId,
    title: snippet.title,
    artist: snippet.channelTitle,
    thumbnail:
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url,
    publishedAt: snippet.publishedAt
  });
}

function trackFromPlaylistItem(item) {
  const snippet = item?.snippet || {};
  const details = item?.contentDetails || {};
  return normalizeTrack({
    id: details.videoId || snippet.resourceId?.videoId,
    title: snippet.title,
    artist: snippet.videoOwnerChannelTitle || snippet.channelTitle,
    thumbnail:
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url
  });
}

function renderCard(track) {
  const t = normalizeTrack(track);
  if (!t) return "";
  return (
    '<article class="card" data-id="' + escapeHtml(t.id) + '">' +
      '<button class="card-open" data-detail-id="' + escapeHtml(t.id) + '">' +
        '<div class="cover image-cover" style="background-image:url(\'' + escapeHtml(t.thumbnail) + '\')"></div>' +
        '<b title="' + escapeHtml(t.title) + '">' + escapeHtml(t.title) + "</b>" +
        "<small>" + escapeHtml(t.artist) + "</small>" +
      "</button>" +
    "</article>"
  );
}

function renderResult(track) {
  const t = normalizeTrack(track);
  if (!t) return "";
  const liked = favs.some(item => item.id === t.id);
  return (
    '<div class="result">' +
      '<button class="result-main" data-detail-id="' + escapeHtml(t.id) + '">' +
        '<img class="thumb thumb-image" src="' + escapeHtml(t.thumbnail) + '" alt="">' +
        '<span class="meta"><b>' + escapeHtml(t.title) + '</b><small>' + escapeHtml(t.artist) + "</small></span>" +
      "</button>" +
      '<button class="result-play" data-play-id="' + escapeHtml(t.id) + '">▶</button>' +
      '<button class="result-like" data-like-id="' + escapeHtml(t.id) + '">' + (liked ? "♥" : "♡") + "</button>" +
    "</div>"
  );
}

function renderSidebarPlaylists() {
  const box = $("#playlistList");
  if (!box) return;
  box.innerHTML = lists.slice(0, 8).map(list =>
    '<button class="side-playlist" data-playlist-id="' + escapeHtml(list.id) + '">' +
      "<span>♫</span><span>" + escapeHtml(list.name) + "</span><small>" + list.tracks.length + "</small>" +
    "</button>"
  ).join("");
}

function renderLibrary(tab = "favorites") {
  const box = $("#libraryContent");
  if (!box) return;

  if (tab === "favorites") {
    box.innerHTML = favs.length
      ? favs.map(renderResult).join("")
      : '<div class="empty-state"><div>♡</div><b>Henüz favorin yok</b><p>Bir şarkının detay ekranından kalbine dokun.</p></div>';
    return;
  }

  if (tab === "offline") { renderOfflineLibrary(); return; }\n\n  if (tab === "history") {
    box.innerHTML = history.length
      ? history.map(renderResult).join("")
      : '<div class="empty-state"><div>◷</div><b>Dinleme geçmişin boş</b><p>Dinlediğin şarkılar burada otomatik görünecek.</p></div>';
    return;
  }

  box.innerHTML = lists.length
    ? lists.map(renderPlaylistCard).join("")
    : '<div class="empty-state"><div>＋</div><b>Henüz playlist yok</b><p>İlk listenizi oluşturup şarkılarını ekleyin.</p><button class="primary" data-create-playlist>Yeni playlist oluştur</button></div>';
}

function renderPlaylistCard(list) {
  const cover = list.tracks[0]?.thumbnail || "";
  const style = cover
    ? ' style="background-image:url(\'' + escapeHtml(cover) + '\')"'
    : "";
  return (
    '<button class="playlist-card" data-open-playlist="' + escapeHtml(list.id) + '">' +
      '<div class="playlist-card-art"' + style + ">" + (cover ? "" : "♫") + "</div>" +
      "<span><b>" + escapeHtml(list.name) + "</b><small>" + list.tracks.length + " şarkı</small></span>" +
      "<i>›</i>" +
    "</button>"
  );
}

function renderEverything() {
  renderSidebarPlaylists();
  renderLibrary("favorites");
  updateProfileStats();
  saveState();
}

function updateProfileStats() {
  const favCount = $("#favCount");
  const historyCount = $("#historyCount");
  const playlistCount = $("#playlistCount");
  if (favCount) favCount.textContent = favs.length;
  if (historyCount) historyCount.textContent = history.length;
  if (playlistCount) playlistCount.textContent = lists.length;
}

function addHistory(track) {
  const t = normalizeTrack(track);
  if (!t) return;
  history = [t, ...history.filter(item => item.id !== t.id)].slice(0, 30);
  saveState();
  updateProfileStats();
}

function playlistById(id) {
  return lists.find(list => list.id === id) || null;
}

function createPlaylist(name) {
  const clean = String(name || "").trim();
  if (!clean) {
    toast("Bir playlist adı yaz.");
    return null;
  }
  const playlist = {
    id: "pl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    name: clean,
    tracks: []
  };
  lists.unshift(playlist);
  saveState();
  renderEverything();
  toast("✓ " + clean + " oluşturuldu");
  return playlist;
}

function openModal(id) {
  const modal = $("#" + id);
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const modal = $("#" + id);
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function openCreatePlaylist() {
  const input = $("#playlistNameInput");
  if (input) {
    input.value = "";
    setTimeout(() => input.focus(), 50);
  }
  openModal("playlistCreateModal");
}

function openPicker(track) {
  const t = normalizeTrack(track);
  if (!t) return;
  pickerTrack = t;

  const title = $("#playlistPickerTrack");
  const list = $("#playlistPickerList");
  if (title) title.textContent = t.title;

  if (list) {
    list.innerHTML = lists.length
      ? lists.map(playlist => {
          const cover = playlist.tracks[0]?.thumbnail || "";
          const style = cover
            ? ' style="background-image:url(\'' + escapeHtml(cover) + '\')"'
            : "";
          return (
            '<button class="picker-item" data-pick-playlist="' + escapeHtml(playlist.id) + '">' +
              '<span class="picker-art"' + style + ">" + (cover ? "" : "♫") + "</span>" +
              "<span><b>" + escapeHtml(playlist.name) + "</b><small>" + playlist.tracks.length + " şarkı</small></span>" +
              "<i>＋</i>" +
            "</button>"
          );
        }).join("")
      : '<div class="empty">Önce bir playlist oluştur.</div>';
  }

  openModal("playlistPickerModal");
}

function addToPlaylist(playlistId) {
  const playlist = playlistById(playlistId);
  if (!playlist || !pickerTrack) return;
  if (playlist.tracks.some(item => item.id === pickerTrack.id)) {
    toast("Şarkı zaten bu listede.");
    return;
  }
  playlist.tracks.push(pickerTrack);
  saveState();
  renderEverything();
  closeModal("playlistPickerModal");
  toast("♪ " + playlist.name + " listesine eklendi");
}

function openPlaylist(id) {
  const playlist = playlistById(id);
  if (!playlist) return;
  activePlaylistId = playlist.id;

  const title = $("#playlistViewTitle");
  const meta = $("#playlistViewMeta");
  const art = $("#playlistViewArt");
  const tracks = $("#playlistViewTracks");

  if (title) title.textContent = playlist.name;
  if (meta) meta.textContent = playlist.tracks.length + " şarkı";

  if (art) {
    const cover = playlist.tracks[0]?.thumbnail || "";
    art.style.backgroundImage = cover ? 'url("' + cover + '")' : "";
    art.textContent = cover ? "" : "♫";
  }

  if (tracks) {
    tracks.innerHTML = playlist.tracks.length
      ? playlist.tracks.map((track, index) =>
          '<div class="playlist-track">' +
            '<button class="playlist-track-main" data-playlist-track="' + escapeHtml(track.id) + '">' +
              '<span class="playlist-index">' + String(index + 1).padStart(2, "0") + "</span>" +
              '<span class="playlist-track-art" style="background-image:url(\'' + escapeHtml(track.thumbnail) + "')\"></span>" +
              "<span><b>" + escapeHtml(track.title) + "</b><small>" + escapeHtml(track.artist) + "</small></span>" +
            "</button>" +
            '<button class="playlist-remove" data-remove-playlist-track="' + escapeHtml(track.id) + '">×</button>' +
          "</div>"
        ).join("")
      : '<div class="empty">Bu listede henüz şarkı yok.</div>';
  }

  openModal("playlistViewModal");
}

function closePlaylistView() {
  closeModal("playlistViewModal");
  activePlaylistId = null;
}

function removeFromPlaylist(trackId) {
  const playlist = playlistById(activePlaylistId);
  if (!playlist) return;
  playlist.tracks = playlist.tracks.filter(track => track.id !== trackId);
  saveState();
  openPlaylist(playlist.id);
  renderEverything();
}

function playPlaylist(shuffle = false) {
  const playlist = playlistById(activePlaylistId);
  if (!playlist || !playlist.tracks.length) {
    toast("Bu playlist boş.");
    return;
  }

  queue = playlist.tracks.map(normalizeTrack).filter(Boolean);
  if (shuffle) queue.sort(() => Math.random() - 0.5);
  queueIndex = 0;
  playTrack(queue[0], 0);
  closePlaylistView();
}

function setPage(id) {
  $$(".page").forEach(section => section.classList.remove("active-page"));
  const target = $("#" + id);
  if (target) target.classList.add("active-page");

  $$(".nav, .mobile-nav button").forEach(button => {
    button.classList.toggle("active", button.dataset.page === id);
  });

  if (window.innerWidth < 901) {
    $(".sidebar")?.classList.remove("open");
  }
}

function updateLikeButtons(track) {
  if (!track) return;
  const liked = favs.some(item => item.id === track.id);
  const playerLike = $("#likeBtn");
  const screenLike = $("#trackScreenLike");
  if (playerLike) playerLike.textContent = liked ? "♥" : "♡";
  if (screenLike) screenLike.textContent = liked ? "♥" : "♡";
}

function toggleFavorite(track) {
  const t = normalizeTrack(track);
  if (!t) return;

  const index = favs.findIndex(item => item.id === t.id);
  if (index >= 0) {
    favs.splice(index, 1);
    toast("Favorilerden çıkarıldı");
  } else {
    favs.unshift(t);
    toast("♥ Favorilere eklendi");
  }

  saveState();
  updateProfileStats();
  updateLikeButtons(t);

  const activeTab = $(".library-tabs button.selected")?.dataset.libraryTab || "favorites";
  if ($("#libraryContent")?.closest("#library")) renderLibrary(activeTab);
}

function openTrackScreen(track) {
  const t = normalizeTrack(track);
  if (!t) return;
  screenTrack = t;

  const screen = $("#trackScreen");
  if (!screen) return;

  const backdrop = $("#trackBackdrop");
  const art = $("#trackScreenArt");
  const title = $("#trackScreenTitle");
  const artist = $("#trackScreenArtist");
  const year = $("#trackScreenYear");
  const play = $("#trackScreenPlay");

  if (backdrop) backdrop.style.backgroundImage = 'url("' + t.thumbnail + '")';
  if (art) art.style.backgroundImage = 'url("' + t.thumbnail + '")';
  if (title) title.textContent = t.title;
  if (artist) artist.textContent = t.artist;
  if (year) year.textContent = t.publishedAt
    ? new Date(t.publishedAt).getFullYear() + " • VYRA MUSIC"
    : "VYRA MUSIC";
  updateLikeButtons(t);
  if (play) play.textContent = playing && current?.id === t.id ? "Ⅱ" : "▶";

  screen.classList.add("open");
  screen.setAttribute("aria-hidden", "false");
}

function closeTrackScreen() {
  const screen = $("#trackScreen");
  if (!screen) return;
  screen.classList.remove("open");
  screen.setAttribute("aria-hidden", "true");
}

function updateProgressUI() {
  if (!playerReady || !player) return;
  let duration = 0;
  let currentTime = 0;

  try {
    duration = player.getDuration() || 0;
    currentTime = player.getCurrentTime() || 0;
  } catch {
    return;
  }

  const progress = $("#progress");
  const screenProgress = $("#screenProgress");

  if (progress) {
    progress.max = duration || 100;
    progress.value = Math.min(currentTime, duration || 100);
    progress.style.setProperty("--progress", duration ? (currentTime / duration * 100) + "%" : "0%");
  }
  if ($("#currentTime")) $("#currentTime").textContent = formatTime(currentTime);
  if ($("#duration")) $("#duration").textContent = formatTime(duration);

  if (screenProgress) {
    screenProgress.max = duration || 100;
    screenProgress.value = Math.min(currentTime, duration || 100);
    screenProgress.style.setProperty("--progress", duration ? (currentTime / duration * 100) + "%" : "0%");
  }
  if ($("#screenCurrent")) $("#screenCurrent").textContent = formatTime(currentTime);
  if ($("#screenDuration")) $("#screenDuration").textContent = formatTime(duration);
}

function startProgress() {
  clearInterval(progressTimer);
  progressTimer = setInterval(updateProgressUI, 200);
}

function stopProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
}

function handlePlayerState(event) {
  if (!window.YT) return;

  const state = event.data;
  if (state === YT.PlayerState.PLAYING) {
    playing = true;
    $("#playBtn") && ($("#playBtn").textContent = "Ⅱ");
    $("#trackScreenPlay") && ($("#trackScreenPlay").textContent = "Ⅱ");
    $(".player")?.classList.add("is-playing");
    startProgress();
    return;
  }

  if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.BUFFERING) {
    if (state === YT.PlayerState.PAUSED) {
      playing = false;
      $("#playBtn") && ($("#playBtn").textContent = "▶");
      $("#trackScreenPlay") && ($("#trackScreenPlay").textContent = "▶");
      $(".player")?.classList.remove("is-playing");
      stopProgress();
    }
    return;
  }

  if (state === YT.PlayerState.ENDED) {
    playing = false;
    $("#playBtn") && ($("#playBtn").textContent = "▶");
    $(".player")?.classList.remove("is-playing");
    stopProgress();
    nextTrack();
  }
}

function initYouTubePlayer() {
  if (!window.YT || !YT.Player || player) return;

  player = new YT.Player("youtubePlayer", {
    width: "200",
    height: "200",
    videoId: "",
    playerVars: {
      autoplay: 0,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1
    },
    events: {
      onReady: () => {
        playerReady = true;
        const volume = Number($("#volume")?.value ?? 70);
        try {
          player.setVolume(volume);
        } catch {}

        if (current?.id) {
          try {
            player.cueVideoById(current.id);
          } catch {}
        }
      },
      onStateChange: handlePlayerState,
      onError: error => { console.warn("YouTube player error:", error); toast("Bu YouTube videosu oynatılamıyor. Başka bir sonuç seç."); },
      onAutoplayBlocked: () => toast("Otomatik oynatma engellendi. Tekrar PLAY düğmesine dokun.")
    }
  });
}

window.onYouTubeIframeAPIReady = initYouTubePlayer;

async function apiRequest(endpoint, params) {
  if (!isApiConfigured()) {
    throw new Error("YouTube API anahtarı ayarlı değil.");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/" + endpoint);
  Object.entries({ ...params, key: YOUTUBE_API_KEY }).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error("YouTube'dan geçerli bir cevap alınamadı.");
  }

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || "YouTube API isteği başarısız.");
  }

  return data;
}

async function searchSongs(query, limit = 15) {
  const data = await apiRequest("search", {
    part: "snippet",
    q: query,
    type: "video",
    maxResults: Math.min(limit, 50),
    safeSearch: "none"
  });

  return normalizeArray(data.items).map(trackFromSearchItem).filter(Boolean);
}

async function searchEntities(query, type, limit = 15) {
  const data = await apiRequest("search", {
    part: "snippet",
    q: query,
    type,
    maxResults: Math.min(limit, 50),
    safeSearch: "none"
  });
  return normalizeArray(data.items);
}

async function searchChannelTracks(channelId, limit = 15) {
  const data = await apiRequest("search", {
    part: "snippet",
    channelId,
    type: "video",
    order: "date",
    maxResults: Math.min(limit, 50)
  });
  return normalizeArray(data.items).map(trackFromSearchItem).filter(Boolean);
}

async function searchPlaylistTracks(playlistId, limit = 25) {
  const data = await apiRequest("playlistItems", {
    part: "snippet,contentDetails",
    playlistId,
    maxResults: Math.min(limit, 50)
  });
  return normalizeArray(data.items).map(trackFromPlaylistItem).filter(Boolean);
}

async function doSearch(query, type = searchType) {
  const q = String(query || "").trim();
  if (!q) {
    toast("Bir şey yazıp ara.");
    return;
  }

  searchType = type;
  setPage("search");

  const status = $("#searchStatus");
  const results = $("#results");
  if (status) status.textContent = "YouTube aranıyor…";
  if (results) results.innerHTML = '<div class="loading">♪ Sonuçlar getiriliyor...</div>';

  try {
    if (type === "songs") {
      const tracks = await searchSongs(q, 20);
      queue = tracks;
      queueIndex = -1;

      if (status) status.textContent = tracks.length + " şarkı bulundu";
      if (results) {
        results.innerHTML = tracks.length
          ? tracks.map(renderResult).join("")
          : '<p class="empty">Bu aramayla sonuç bulunamadı.</p>';
      }
      return;
    }

    const entityType = type === "artists" ? "channel" : "playlist";
    const items = await searchEntities(q, entityType, 20);

    if (status) {
      status.textContent = items.length + (type === "artists" ? " sanatçı bulundu" : " albüm bulundu");
    }
    if (results) {
      results.innerHTML = items.length
        ? items.map(item => renderEntityCard(item, type)).join("")
        : '<p class="empty">Sonuç bulunamadı.</p>';
    }
  } catch (error) {
    console.error("VYRA search error:", error);
    if (status) status.textContent = "";
    if (results) {
      results.innerHTML =
        '<div class="api-warning"><b>YouTube bağlantısı kurulamadı.</b><p>' +
        escapeHtml(error.message) +
        "</p></div>";
    }
  }
}

function renderEntityCard(item, type) {
  const snippet = item?.snippet || {};
  const id = type === "artists" ? item?.id?.channelId : item?.id?.playlistId;
  const image =
    snippet.thumbnails?.high?.url ||
    snippet.thumbnails?.medium?.url ||
    snippet.thumbnails?.default?.url ||
    "";

  return (
    '<button class="entity-card" data-entity-type="' + escapeHtml(type) +
    '" data-entity-id="' + escapeHtml(id || "") +
    '" data-entity-title="' + escapeHtml(snippet.title || "") +
    '" data-entity-img="' + escapeHtml(image) + '">' +
      '<span class="entity-card-art" style="background-image:url(\'' + escapeHtml(image) + "')\">" +
        (image ? "" : "♫") +
      "</span>" +
      "<span><b>" + escapeHtml(snippet.title || "Bilinmeyen") + "</b>" +
      "<small>" + (type === "artists" ? "Sanatçı" : "Albüm") + " • YouTube</small></span>" +
      "<i>›</i>" +
    "</button>"
  );
}

async function openEntity(type, id, title, image) {
  if (!id) return;

  const screen = $("#entityScreen");
  if (!screen) return;

  if ($("#entityType")) $("#entityType").textContent = type === "artists" ? "SANATÇI" : "ALBÜM";
  if ($("#entityTitle")) $("#entityTitle").textContent = title || "VYRA";
  if ($("#entitySub")) $("#entitySub").textContent =
    type === "artists" ? "YouTube sanatçı kanalı" : "YouTube albüm / playlist";

  if ($("#entityArt")) $("#entityArt").style.backgroundImage = image ? 'url("' + image + '")' : "";
  if ($("#entityBackdrop")) $("#entityBackdrop").style.backgroundImage = image ? 'url("' + image + '")' : "";
  if ($("#entityTracks")) $("#entityTracks").innerHTML = '<div class="loading">♪ Koleksiyon hazırlanıyor...</div>';

  screen.classList.add("open");
  screen.setAttribute("aria-hidden", "false");

  try {
    const tracks = type === "artists"
      ? await searchChannelTracks(id)
      : await searchPlaylistTracks(id);

    queue = tracks;
    queueIndex = -1;

    if ($("#entityTracks")) {
      $("#entityTracks").innerHTML = tracks.length
        ? tracks.map((track, index) =>
            '<button class="entity-track" data-entity-track="' + escapeHtml(track.id) + '">' +
              "<span>" + String(index + 1).padStart(2, "0") + "</span>" +
              '<img src="' + escapeHtml(track.thumbnail) + '" alt="">' +
              "<b>" + escapeHtml(track.title) + "</b>" +
              "<small>" + escapeHtml(track.artist) + "</small><i>▶</i>" +
            "</button>"
          ).join("")
        : '<div class="empty">Bu koleksiyonda parça bulunamadı.</div>';
    }
  } catch (error) {
    console.error("VYRA entity error:", error);
    if ($("#entityTracks")) {
      $("#entityTracks").innerHTML =
        '<div class="api-warning"><b>İçerik alınamadı.</b><p>' +
        escapeHtml(error.message) +
        "</p></div>";
    }
  }
}

function closeEntity() {
  const screen = $("#entityScreen");
  if (!screen) return;
  screen.classList.remove("open");
  screen.setAttribute("aria-hidden", "true");
}

const OFFLINE_DB="vyraOffline";const OFFLINE_STORE="tracks";
function openOfflineDB(){return new Promise((resolve,reject)=>{if(!("indexedDB" in window))return reject(new Error("Çevrimdışı depolama desteklenmiyor."));const request=indexedDB.open(OFFLINE_DB,2);request.onupgradeneeded=()=>request.result.createObjectStore(OFFLINE_STORE,{keyPath:"id"});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("Çevrimdışı depolama açılamadı."));});}
async function saveOfflineTrack(track){const t=normalizeTrack(track);if(!t)return;try{const db=await openOfflineDB();await new Promise((resolve,reject)=>{const tx=db.transaction(OFFLINE_STORE,"readwrite");tx.objectStore(OFFLINE_STORE).put({...t,savedAt:Date.now(),offlineAudio:false});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});toast("✓ Koleksiyona kaydedildi • YouTube sesi indirilemiyor");}catch(error){console.warn("VYRA offline storage:",error);toast("Çevrimdışı kayıt kullanılamıyor.");}}
async function isOfflineSaved(id){try{const db=await openOfflineDB();return await new Promise(resolve=>{const tx=db.transaction(OFFLINE_STORE,"readonly");const req=tx.objectStore(OFFLINE_STORE).get(id);req.onsuccess=()=>resolve(Boolean(req.result));req.onerror=()=>resolve(false);});}catch{return false;}}
function updateOfflineButton(track){if(!track)return;isOfflineSaved(track.id).then(saved=>["#downloadBtn","#trackScreenDownload"].forEach(selector=>{const button=$(selector);if(button){button.textContent=saved?"✓":"⇩";button.title=saved?"Çevrimdışı koleksiyonda":"Çevrimdışı kaydet";button.classList.toggle("saved",saved);}}));}
let vyraOnlineCheck=null;
async function verifyConnection(){
  if(vyraOnlineCheck) return vyraOnlineCheck;
  if(navigator.onLine===false){ updateOfflineStatus(true); return false; }
  // navigator.onLine is only a hint. Do not mark VYRA offline because
  // a GitHub Pages connectivity probe or Service Worker cache misses.
  vyraOnlineCheck=(async()=>{
    updateOfflineStatus(false);
    return true;
  })();
  return vyraOnlineCheck;
}
function updateOfflineStatus(forceOffline=null){
  const bar=$("#offlineBar");
  if(!bar)return;
  // Do not use navigator.onLine for the normal UI: it can report false
  // negatives on GitHub Pages, mobile Chrome, PWAs and WebViews.
  // The offline library remains available independently.
  const offline=forceOffline===true;
  bar.hidden=!offline;
  document.body.classList.toggle("is-offline",offline);
}
function setupOfflineMode(){
  // Start hidden. Only an explicit offline event may show the banner.
  updateOfflineStatus(false);
  window.addEventListener("online",()=>updateOfflineStatus(false));
  window.addEventListener("offline",()=>updateOfflineStatus(true));
  updateOfflineButton(current);
}
function markOnline(){ updateOfflineStatus(false); }
\nfunction playTrack(track, index = -1) {
  if (localMedia && window.__vyraLocalPlayer) { window.__vyraLocalPlayer.pause(); localMedia=null; }
  const t = normalizeTrack(track);
  if (!t) return;

  current = t;

  if (index >= 0) {
    queueIndex = index;
  } else {
    const existingIndex = queue.findIndex(item => item.id === t.id);
    if (existingIndex >= 0) {
      queueIndex = existingIndex;
    } else {
      queue = [t];
      queueIndex = 0;
    }
  }

  if ($("#nowTitle")) $("#nowTitle").textContent = t.title;
  if ($("#nowArtist")) $("#nowArtist").textContent = t.artist;

  const nowArt = $("#nowArt");
  if (nowArt) {
    nowArt.style.backgroundImage = t.thumbnail ? 'url("' + t.thumbnail + '")' : "";
    nowArt.textContent = t.thumbnail ? "" : "V";
    nowArt.classList.toggle("has-image", Boolean(t.thumbnail));
  }

  if ($("#youtubeLabel")) $("#youtubeLabel").textContent = t.title;
  document.title = t.title + " — VYRA";
  addHistory(t);
  updateLikeButtons(t);
  openTrackScreen(t);

  if (!playerReady || !player) {
    toast("Player hazırlanıyor… tekrar oynat'a dokun.");
    return;
  }

  try {
    player.loadVideoById(t.id);
    const volume = Number($("#volume")?.value ?? 70);
    player.setVolume(volume);
    player.playVideo();
  } catch (error) {
    console.error("VYRA playback error:", error);
    toast("Şarkı başlatılamadı.");
  }
}

function togglePlayback() {
  if (!current) {
    if (queue.length) {
      playTrack(queue[0], 0);
    } else {
      toast("Önce bir şarkı seç.");
    }
    return;
  }

  if (!playerReady || !player) {
    toast("Player hazırlanıyor…");
    return;
  }

  try {
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  } catch {
    toast("Player henüz hazır değil.");
  }
}

function nextTrack() {
  if (!queue.length) return;
  queueIndex = (queueIndex + 1) % queue.length;
  playTrack(queue[queueIndex], queueIndex);
}

function previousTrack() {
  if (!queue.length) return;

  try {
    if (playerReady && player && player.getCurrentTime() > 5) {
      player.seekTo(0, true);
      return;
    }
  } catch {}

  queueIndex = (queueIndex - 1 + queue.length) % queue.length;
  playTrack(queue[queueIndex], queueIndex);
}

function renderHomeSections(tracks) {
  const source = normalizeArray(tracks).map(normalizeTrack).filter(Boolean);
  const fallback = source.slice(0, 8);
  const personal = history.length ? history.slice(0, 8) : (favs.length ? favs.slice(0, 8) : fallback);
  const recent = history.length ? history.slice(0, 8) : fallback.slice(0, 4);
  const trending = source.slice(0, 8);
  const quick = source.slice(2, 10);

  const sections = [
    ["#madeForYou", personal],
    ["#recentlyPlayed", recent],
    ["#trending", trending],
    ["#quickPicks", quick]
  ];

  sections.forEach(([selector, items]) => {
    const node = $(selector);
    if (!node) return;
    node.innerHTML = items.length
      ? items.map(renderCard).join("")
      : '<div class="empty-state"><div>♫</div><b>Henüz içerik yok</b><p>Biraz müzik dinlediğinde burada görünecek.</p></div>';
  });
}

function loadFeatured() {
  const discover = $("#discoverGrid");
  if (!discover) return;

  if (!isApiConfigured()) {
    ["#madeForYou", "#recentlyPlayed", "#trending", "#quickPicks"].forEach(selector => {
      const node = $(selector);
      if (node) node.innerHTML = '<div class="api-warning"><b>YouTube bağlantısı hazır değil.</b><p>API anahtarını kontrol et.</p></div>';
    });
    discover.innerHTML =
      '<div class="api-warning"><b>YouTube bağlantısı hazır değil.</b><p>API anahtarını kontrol et.</p></div>';
    return;
  }

  const seed = history[0]?.title || favs[0]?.title || "popular music";
  searchSongs(seed, 20)
    .then(tracks => {
      markOnline();
      queue = tracks;
      queueIndex = -1;
      renderHomeSections(tracks);
      discover.innerHTML = tracks.map(renderCard).join("");
    })
    .catch(error => {
      if (error?.name === "TypeError" || !navigator.onLine) updateOfflineStatus(true);
      console.error("VYRA home error:", error);
      const message =
        '<div class="api-warning"><b>Müzikler yüklenemedi.</b><p>' +
        escapeHtml(error.message) +
        "</p></div>";
      ["#madeForYou", "#recentlyPlayed", "#trending", "#quickPicks"].forEach(selector => {
        const node = $(selector);
        if (node) node.innerHTML = message;
      });
      discover.innerHTML = message;
    });
}

function bindEvents() {
  $("#searchInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      const value = event.target.value.trim();
      $("#bigSearch") && ($("#bigSearch").value = value);
      doSearch(value);
    }
  });

  $("#bigSearchBtn")?.addEventListener("click", () => {
    doSearch($("#bigSearch")?.value || "", searchType);
  });

  $("#bigSearch")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      doSearch(event.target.value, searchType);
    }
  });

  $$("[data-search-type]").forEach(button => {
    button.addEventListener("click", () => {
      $$("[data-search-type]").forEach(item => item.classList.remove("selected"));
      button.classList.add("selected");
      searchType = button.dataset.searchType || "songs";
      const q = $("#bigSearch")?.value.trim();
      if (q) doSearch(q, searchType);
    });
  });

  $("#startBtn")?.addEventListener("click", () => {
    setPage("search");
    if ($("#bigSearch")) $("#bigSearch").value = "popular music";
    doSearch("popular music", "songs");
  });

  $("#playBtn")?.addEventListener("click", togglePlayback);
  $("#nextBtn")?.addEventListener("click", nextTrack);
  $("#prevBtn")?.addEventListener("click", previousTrack);

  $("#likeBtn")?.addEventListener("click", () => {
    if (current) toggleFavorite(current);
  });

  const downloadCurrent = () => {
    $("#offlineFileInput")?.click();
    if (!$("#offlineFileInput")) toast("Offline dosya seçici hazır değil.");
  };
  $("#downloadBtn")?.addEventListener("click", downloadCurrent);
  $("#trackScreenDownload")?.addEventListener("click", () => {
    $("#offlineFileInput")?.click();
  });

  $("#progress")?.addEventListener("input", event => {
    const value = Number(event.target.value) || 0;
    const max = Number(event.target.max) || 100;
    event.target.style.setProperty("--progress", (value / max * 100) + "%");
    if (playerReady && player) {
      try { player.seekTo(value, true); } catch {}
    }
  });

  $("#screenProgress")?.addEventListener("input", event => {
    const value = Number(event.target.value) || 0;
    const max = Number(event.target.max) || 100;
    event.target.style.setProperty("--progress", (value / max * 100) + "%");
    if (playerReady && player) {
      try { player.seekTo(value, true); } catch {}
    }
  });

  $("#volume")?.addEventListener("input", event => {
    if (playerReady && player) {
      try { player.setVolume(Number(event.target.value)); } catch {}
    }
  });

  $("#newPlaylist")?.addEventListener("click", openCreatePlaylist);
  $("#libraryNewPlaylist")?.addEventListener("click", openCreatePlaylist);

  $("#playlistCreateSubmit")?.addEventListener("click", () => {
    const playlist = createPlaylist($("#playlistNameInput")?.value || "");
    if (playlist) closeModal("playlistCreateModal");
  });

  $("#playlistNameInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") $("#playlistCreateSubmit")?.click();
  });

  $("#pickerNewPlaylist")?.addEventListener("click", () => {
    closeModal("playlistPickerModal");
    openCreatePlaylist();
  });

  $$("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  $("#playlistViewClose")?.addEventListener("click", closePlaylistView);
  $("#playlistPlayAll")?.addEventListener("click", () => playPlaylist(false));
  $("#playlistShuffle")?.addEventListener("click", () => playPlaylist(true));

  $("#closeYoutube")?.addEventListener("click", () => {
    $("#youtubeDock")?.classList.remove("open");
  });

  $("#mobileMenu")?.addEventListener("click", () => {
    $(".sidebar")?.classList.toggle("open");
  });

  $("#profileBtn")?.addEventListener("click", () => {
    $("#profilePanel")?.classList.add("open");
    updateProfileStats();
  });

  $("#profileClose")?.addEventListener("click", () => {
    $("#profilePanel")?.classList.remove("open");
  });

  $("#profileLibrary")?.addEventListener("click", () => {
    $("#profilePanel")?.classList.remove("open");
    setPage("library");
  });

  $("#trackScreenClose")?.addEventListener("click", closeTrackScreen);

  $("#trackScreenPlay")?.addEventListener("click", () => {
    if (!screenTrack) return;
    if (current?.id !== screenTrack.id) playTrack(screenTrack);
    else togglePlayback();
  });

  $("#screenPlaySmall")?.addEventListener("click", () => {
    if (!screenTrack) return;
    if (current?.id !== screenTrack.id) playTrack(screenTrack);
    else togglePlayback();
  });

  $("#screenPrev")?.addEventListener("click", previousTrack);
  $("#screenNext")?.addEventListener("click", nextTrack);

  $("#trackScreenLike")?.addEventListener("click", () => {
    if (!screenTrack) return;
    toggleFavorite(screenTrack);
    openTrackScreen(screenTrack);
  });

  $("#trackScreenAdd")?.addEventListener("click", () => {
    if (screenTrack) openPicker(screenTrack);
  });

  $("#nowArt")?.addEventListener("click", () => {
    if (current) openTrackScreen(current);
  });

  $$(".nav, .mobile-nav button").forEach(button => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });

  $$("[data-page-target]").forEach(button => {
    button.addEventListener("click", () => setPage(button.dataset.pageTarget));
  });

  $$(".chips button").forEach(button => {
    button.addEventListener("click", () => {
      const query = button.dataset.query || "";
      if ($("#bigSearch")) $("#bigSearch").value = query;
      doSearch(query, "songs");
    });
  });

  $$(".library-tabs button").forEach(button => {
    button.addEventListener("click", () => {
      $$(".library-tabs button").forEach(item => item.classList.remove("selected"));
      button.classList.add("selected");
      renderLibrary(button.dataset.libraryTab || "favorites");
    });
  });

  $("#entityClose")?.addEventListener("click", closeEntity);

  document.addEventListener("click", event => {
    const entity = event.target.closest("[data-entity-type]");
    if (entity) {
      openEntity(
        entity.dataset.entityType,
        entity.dataset.entityId,
        entity.dataset.entityTitle,
        entity.dataset.entityImg
      );
      return;
    }

    const entityTrack = event.target.closest("[data-entity-track]");
    if (entityTrack) {
      const track = queue.find(item => item.id === entityTrack.dataset.entityTrack);
      if (track) playTrack(track, queue.indexOf(track));
      return;
    }

    const pick = event.target.closest("[data-pick-playlist]");
    if (pick) {
      addToPlaylist(pick.dataset.pickPlaylist);
      return;
    }

    const open = event.target.closest("[data-open-playlist]");
    if (open) {
      openPlaylist(open.dataset.openPlaylist);
      return;
    }

    const side = event.target.closest("[data-playlist-id]");
    if (side) {
      openPlaylist(side.dataset.playlistId);
      return;
    }

    const playlistTrack = event.target.closest("[data-playlist-track]");
    if (playlistTrack) {
      const playlist = playlistById(activePlaylistId);
      const track = playlist?.tracks.find(item => item.id === playlistTrack.dataset.playlistTrack);
      if (playlist && track) {
        queue = playlist.tracks.map(normalizeTrack).filter(Boolean);
        queueIndex = queue.findIndex(item => item.id === track.id);
        playTrack(track, queueIndex);
      }
      return;
    }

    const remove = event.target.closest("[data-remove-playlist-track]");
    if (remove) {
      removeFromPlaylist(remove.dataset.removePlaylistTrack);
      return;
    }

    const create = event.target.closest("[data-create-playlist]");
    if (create) {
      openCreatePlaylist();
      return;
    }

    const playButton = event.target.closest("[data-play-id]");
    if (playButton) {
      const track = findTrackAnywhere(playButton.dataset.playId);
      if (track) playTrack(track);
      return;
    }

    const likeButton = event.target.closest("[data-like-id]");
    if (likeButton) {
      const track = findTrackAnywhere(likeButton.dataset.likeId);
      if (track) toggleFavorite(track);
      return;
    }

    const detail = event.target.closest("[data-detail-id]");
    if (detail) {
      const track = findTrackAnywhere(detail.dataset.detailId);
      if (track) openTrackScreen(track);
    }
  });
}

function findTrackAnywhere(id) {
  return (
    queue.find(item => item.id === id) ||
    favs.find(item => item.id === id) ||
    history.find(item => item.id === id) ||
    lists.flatMap(list => list.tracks).find(item => item.id === id) ||
    null
  );
}

let deferredInstallPrompt = null;

function setupPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).catch(error => console.warn("VYRA SW:", error));
  }

  const installBtn = $("#installBtn");
  if (!installBtn) return;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installBtn.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch {}
    deferredInstallPrompt = null;
    installBtn.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installBtn.hidden = true;
    toast("✓ VYRA uygulama olarak yüklendi");
  });
}


const LOCAL_OFFLINE_STORE="media";
let localMedia=null;
let localObjectUrl=null;

function openLocalDB(){
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)) return reject(new Error("IndexedDB desteklenmiyor."));
    const request=indexedDB.open(OFFLINE_DB,2);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(OFFLINE_STORE)) db.createObjectStore(OFFLINE_STORE,{keyPath:"id"});
      if(!db.objectStoreNames.contains(LOCAL_OFFLINE_STORE)) db.createObjectStore(LOCAL_OFFLINE_STORE,{keyPath:"id"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Offline depolama açılamadı."));
  });
}
async function saveLocalMedia(file){
  if(!file)return;
  if(!file.type.startsWith("audio/")&&!file.type.startsWith("video/")){toast("Sadece ses veya video dosyası seç.");return;}
  if(file.size>500*1024*1024){toast("Dosya 500 MB'dan küçük olmalı.");return;}
  const id="local_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);
  const title=file.name.replace(/\.[^.]+$/,"")||"VYRA Offline";
  const item={id,title,artist:"Cihazındaki müzik",thumbnail:"",mime:file.type,size:file.size,blob:file,savedAt:Date.now(),local:true};
  try{
    const db=await openLocalDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(LOCAL_OFFLINE_STORE,"readwrite");
      tx.objectStore(LOCAL_OFFLINE_STORE).put(item);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    toast("✓ VYRA Offline'a kaydedildi");
    renderOfflineLibrary();
  }catch(e){console.error(e);toast("Dosya kaydedilemedi.");}
}
async function getLocalMedia(id){
  try{
    const db=await openLocalDB();
    return await new Promise((resolve,reject)=>{
      const req=db.transaction(LOCAL_OFFLINE_STORE,"readonly").objectStore(LOCAL_OFFLINE_STORE).get(id);
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    });
  }catch{return null;}
}
async function listLocalMedia(){
  try{
    const db=await openLocalDB();
    return await new Promise((resolve,reject)=>{
      const req=db.transaction(LOCAL_OFFLINE_STORE,"readonly").objectStore(LOCAL_OFFLINE_STORE).getAll();
      req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
    });
  }catch{return [];}
}
async function deleteLocalMedia(id){
  try{
    const db=await openLocalDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(LOCAL_OFFLINE_STORE,"readwrite");
      tx.objectStore(LOCAL_OFFLINE_STORE).delete(id);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    if(localMedia?.id===id){localMedia=null;if(localObjectUrl){URL.revokeObjectURL(localObjectUrl);localObjectUrl=null;}}
    renderOfflineLibrary();toast("Offline dosyası silindi");
  }catch{toast("Dosya silinemedi.");}
}
function localTrack(item){return {id:item.id,title:item.title,artist:item.artist,thumbnail:item.thumbnail||"",publishedAt:"",local:true,mime:item.mime,size:item.size};}
async function renderOfflineLibrary(){
  const box=$("#libraryContent"); if(!box)return;
  const items=await listLocalMedia();
  const size=(items.reduce((n,x)=>n+(x.size||0),0)/1048576).toFixed(1);
  box.innerHTML='<div class="offline-library-head"><div><b>VYRA Offline</b><small>'+items.length+' dosya • '+size+' MB</small></div><button class="primary" id="offlineAddBtn">＋ Dosya ekle</button></div>'+
    (items.length?items.sort((a,b)=>b.savedAt-a.savedAt).map(item=>'<div class="result offline-result"><button class="result-main" data-offline-play="'+escapeHtml(item.id)+'"><div class="offline-file-icon">'+(item.mime?.startsWith("video/")?"▶":"♫")+'</div><span class="meta"><b>'+escapeHtml(item.title)+'</b><small>'+escapeHtml(item.artist)+' • '+((item.size||0)/1048576).toFixed(1)+' MB</small></span></button><button class="result-like offline-delete" data-offline-delete="'+escapeHtml(item.id)+'">×</button></div>').join(""):'<div class="empty-state offline-empty"><div>📥</div><b>Offline koleksiyonun boş</b><p>Kendi MP3, M4A, WAV veya video dosyanı ekle. İnternet olmadan VYRA içinden çal.</p><button class="primary" id="offlineEmptyAdd">＋ İlk dosyanı ekle</button></div>');
  $("#offlineAddBtn")?.addEventListener("click",()=>$("#offlineFileInput")?.click());
  $("#offlineEmptyAdd")?.addEventListener("click",()=>$("#offlineFileInput")?.click());
}
async function playLocalMediaById(id){
  const item=await getLocalMedia(id); if(!item)return;
  if(localObjectUrl)URL.revokeObjectURL(localObjectUrl);
  localObjectUrl=URL.createObjectURL(item.blob); localMedia=item;
  if(!window.__vyraLocalPlayer){
    const media=document.createElement("video");
    media.id="vyraLocalPlayer";media.style.display="none";media.playsInline=true;
    media.addEventListener("ended",()=>{playing=false;$(".player")?.classList.remove("is-playing");});
    media.addEventListener("timeupdate",()=>{
      const d=media.duration||0, t=media.currentTime||0;
      ["#progress","#screenProgress"].forEach(s=>{const el=$(s);if(el){el.max=d||100;el.value=t;}});
      if($("#currentTime"))$("#currentTime").textContent=formatTime(t);
      if($("#screenCurrent"))$("#screenCurrent").textContent=formatTime(t);
      if($("#duration"))$("#duration").textContent=formatTime(d);
      if($("#screenDuration"))$("#screenDuration").textContent=formatTime(d);
    });
    document.body.appendChild(media);window.__vyraLocalPlayer=media;
  }
  const media=window.__vyraLocalPlayer;media.src=localObjectUrl;media.volume=Number($("#volume")?.value||70)/100;
  current=localTrack(item);screenTrack=current;playing=true;
  if($("#nowTitle"))$("#nowTitle").textContent=current.title;if($("#nowArtist"))$("#nowArtist").textContent=current.artist;
  if($("#nowArt")){$("#nowArt").style.backgroundImage="";$("#nowArt").textContent="♫";}
  updateLikeButtons(current);openTrackScreen(current);$(".player")?.classList.add("is-playing");
  try{await media.play();toast("▶ Offline oynatılıyor");}catch{toast("Oynatmak için tekrar dokun.");}
}
function setupLocalOffline(){
  $("#offlineFileInput")?.addEventListener("change",e=>{
    const files=[...e.target.files];files.forEach(saveLocalMedia);e.target.value="";
  });
  document.addEventListener("click",e=>{
    const play=e.target.closest("[data-offline-play]");if(play){playLocalMediaById(play.dataset.offlinePlay);return;}
    const del=e.target.closest("[data-offline-delete]");if(del){deleteLocalMedia(del.dataset.offlineDelete);return;}
  });
}

function boot() {
  setupPWA();
  setupOfflineMode();
  setupLocalOffline();
  if (window.lucide) window.lucide.createIcons();
  loadState();
  bindEvents();
  renderEverything();
  loadFeatured();

  if (window.YT?.Player) {
    initYouTubePlayer();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
