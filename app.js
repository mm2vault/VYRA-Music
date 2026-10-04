const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const YOUTUBE_API_KEY = "AIzaSyAPcOxJ9CBs75V-WSXg7v0YnYW-FAuCxe8";

let current=null, screenTrack=null, playing=false, queue=[], queueIndex=-1, player=null, playerReady=false, progressTimer=null;
let favs=JSON.parse(localStorage.getItem("vyraFavs")||"[]");
let history=JSON.parse(localStorage.getItem("vyraHistory")||"[]");
let rawLists=JSON.parse(localStorage.getItem("vyraLists")||"[]");
let lists=rawLists.map((x,i)=>typeof x==="string"?{id:"pl_"+Date.now()+"_"+i,name:x,tracks:[]}:{id:x.id||"pl_"+Date.now()+"_"+i,name:x.name||"Yeni liste",tracks:Array.isArray(x.tracks)?x.tracks:[]});
let activePlaylistId=null,pickerTrack=null;

function toast(message){const x=$("#toast");x.textContent=message;x.classList.add("show");clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>x.classList.remove("show"),2200)}
function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function isConfigured(){return YOUTUBE_API_KEY&&!YOUTUBE_API_KEY.includes("YOUR_")}
function formatTime(seconds){seconds=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0")}
function trackFromVideo(item){const s=item.snippet||{};return{id:item.id?.videoId||item.id,title:s.title||"Bilinmeyen şarkı",artist:s.channelTitle||"YouTube",thumbnail:s.thumbnails?.high?.url||s.thumbnails?.medium?.url||s.thumbnails?.default?.url||"",publishedAt:s.publishedAt||""}}
function card(t){return `<article class="card" data-id="${escapeHtml(t.id)}"><button class="card-open" data-detail-id="${escapeHtml(t.id)}"><div class="cover image-cover" style="background-image:url('${escapeHtml(t.thumbnail)}')"></div><b title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</b><small>${escapeHtml(t.artist)}</small></button></article>`}
function result(t){const liked=favs.some(x=>x.id===t.id);return `<div class="result"><button class="result-main" data-detail-id="${escapeHtml(t.id)}"><img class="thumb thumb-image" src="${escapeHtml(t.thumbnail)}" alt=""><span class="meta"><b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.artist)}</small></span></button><button class="result-play" data-play-id="${escapeHtml(t.id)}">▶</button><button class="result-like" data-like-id="${escapeHtml(t.id)}">${liked?"♥":"♡"}</button></div>`}
function playlistById(id){return lists.find(x=>x.id===id)}
function renderSidebarPlaylists(){const box=$("#playlistList");box.innerHTML=lists.slice(0,8).map(x=>"<button class=\"side-playlist\" data-playlist-id=\""+escapeHtml(x.id)+"\"><span>♫</span><span>"+escapeHtml(x.name)+"</span><small>"+x.tracks.length+"</small></button>").join("")}
function render(){renderSidebarPlaylists();renderLibrary("favorites");updateProfileStats();saveState()}
function renderLibrary(tab){const box=$("#libraryContent");if(!box)return;if(tab==="favorites")box.innerHTML=favs.length?favs.map(result).join(""):"<div class=\"empty-state\"><div>♡</div><b>Henüz favorin yok</b><p>Bir şarkının detay ekranından kalbine dokun.</p></div>";else if(tab==="history")box.innerHTML=history.length?history.map(result).join(""):"<div class=\"empty-state\"><div>◷</div><b>Dinleme geçmişin boş</b><p>Dinlediğin şarkılar burada otomatik görünecek.</p></div>";else box.innerHTML=lists.length?lists.map(playlistCard).join(""):"<div class=\"empty-state\"><div>＋</div><b>Henüz playlist yok</b><p>İlk listenizi oluşturup şarkılarını ekleyin.</p><button class=\"primary\" data-create-playlist>Yeni playlist oluştur</button></div>"}
function playlistCard(p){const cover=p.tracks[0]?.thumbnail||"";const art=cover?" style=\"background-image:url(\'"+escapeHtml(cover)+"\')\"":"";return "<button class=\"playlist-card\" data-open-playlist=\""+escapeHtml(p.id)+"\"><div class=\"playlist-card-art\""+art+">"+(cover?"":"♫")+"</div><span><b>"+escapeHtml(p.name)+"</b><small>"+p.tracks.length+" şarkı</small></span><i>›</i></button>"}
function saveState(){localStorage.setItem("vyraFavs",JSON.stringify(favs));localStorage.setItem("vyraHistory",JSON.stringify(history));localStorage.setItem("vyraLists",JSON.stringify(lists))}
function addHistory(t){history=[t,...history.filter(x=>x.id!==t.id)].slice(0,30);saveState()}
function createPlaylist(name){const clean=String(name||"").trim();if(!clean)return null;const p={id:"pl_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),name:clean,tracks:[]};lists.unshift(p);saveState();render();toast("✓ "+clean+" oluşturuldu");return p}
function openCreatePlaylist(){const modal=$("#playlistCreateModal");if(!modal)return;$("#playlistNameInput").value="";modal.classList.add("open");modal.setAttribute("aria-hidden","false");setTimeout(()=>$("#playlistNameInput").focus(),80)}
function closeModal(id){const x=$("#"+id);if(x){x.classList.remove("open");x.setAttribute("aria-hidden","true")}}
function openPicker(t){pickerTrack=t;if(!t?.id)return;$("#playlistPickerTrack").textContent=t.title;const box=$("#playlistPickerList");box.innerHTML=lists.length?lists.map(p=>{const c=p.tracks[0]?.thumbnail||"";const art=c?" style=\"background-image:url(\'"+escapeHtml(c)+"\')\"":"";return "<button class=\"picker-item\" data-pick-playlist=\""+escapeHtml(p.id)+"\"><span class=\"picker-art\""+art+">"+(c?"":"♫")+"</span><span><b>"+escapeHtml(p.name)+"</b><small>"+p.tracks.length+" şarkı</small></span><i>＋</i></button>"}).join(""):"<div class=\"empty\">Önce bir playlist oluştur.</div>";$("#playlistPickerModal").classList.add("open");$("#playlistPickerModal").setAttribute("aria-hidden","false")}
function addToPlaylist(id,t=pickerTrack){const p=playlistById(id);if(!p||!t)return;if(p.tracks.some(x=>x.id===t.id)){toast("Şarkı zaten bu listede");return}p.tracks.push(t);saveState();render();closeModal("playlistPickerModal");toast("♪ "+p.name+" listesine eklendi")}
function openPlaylist(id){const p=playlistById(id);if(!p)return;activePlaylistId=id;$("#playlistViewTitle").textContent=p.name;$("#playlistViewMeta").textContent=p.tracks.length+" şarkı";const art=$("#playlistViewArt");if(p.tracks[0]?.thumbnail){art.style.backgroundImage="url(\""+p.tracks[0].thumbnail+"\")";art.textContent=""}else{art.style.backgroundImage="";art.textContent="♫"}$("#playlistViewTracks").innerHTML=p.tracks.length?p.tracks.map((t,i)=>"<div class=\"playlist-track\"><button class=\"playlist-track-main\" data-playlist-track=\""+escapeHtml(t.id)+"\"><span class=\"playlist-index\">"+String(i+1).padStart(2,"0")+"</span><span class=\"playlist-track-art\" style=\"background-image:url(\'"+escapeHtml(t.thumbnail)+"\')\"></span><span><b>"+escapeHtml(t.title)+"</b><small>"+escapeHtml(t.artist)+"</small></span></button><button class=\"playlist-remove\" data-remove-playlist-track=\""+escapeHtml(t.id)+"\">×</button></div>").join(""):"<div class=\"empty\">Bu listede henüz şarkı yok. Bir şarkının detay ekranından ＋ butonuna dokun.</div>";$("#playlistViewModal").classList.add("open");$("#playlistViewModal").setAttribute("aria-hidden","false")}
function closePlaylistView(){closeModal("playlistViewModal");activePlaylistId=null}
function playPlaylist(shuffle=false){const p=playlistById(activePlaylistId);if(!p?.tracks.length){toast("Bu playlist boş");return}queue=[...p.tracks];if(shuffle)queue.sort(()=>Math.random()-.5);queueIndex=0;playTrack(queue[0],0);closePlaylistView()}
function removeFromPlaylist(id){const p=playlistById(activePlaylistId);if(!p)return;p.tracks=p.tracks.filter(x=>x.id!==id);saveState();openPlaylist(p.id);render()}
function page(id){$$(".page").forEach(x=>x.classList.remove("active-page"));$("#"+id)?.classList.add("active-page");$$(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===id));if(innerWidth<901)$(".sidebar")?.classList.remove("open")}
function saveState(){localStorage.setItem("vyraFavs",JSON.stringify(favs));localStorage.setItem("vyraHistory",JSON.stringify(history));localStorage.setItem("vyraLists",JSON.stringify(lists))}
function addHistory(t){history=[t,...history.filter(x=>x.id!==t.id)].slice(0,30);saveState()}
function toggleFav(t){const i=favs.findIndex(x=>x.id===t.id);if(i>=0){favs.splice(i,1);toast("Favorilerden çıkarıldı")}else{favs.unshift(t);toast("♥ Favorilere eklendi")}saveState();updateLikeButton();renderLibrary("favorites")}
function updateLikeButton(){if(!current)return;$("#likeBtn").textContent=favs.some(x=>x.id===current.id)?"♥":"♡";updateProfileStats()}
function updateProfileStats(){$("#favCount")?.replaceChildren(document.createTextNode(favs.length));$("#historyCount")?.replaceChildren(document.createTextNode(history.length));$("#playlistCount")?.replaceChildren(document.createTextNode(lists.length))}
function onYouTubeIframeAPIReady(){
  player=new YT.Player("youtubePlayer",{width:"100%",height:"100%",videoId:"",playerVars:{autoplay:0,controls:1,rel:0,modestbranding:1,playsinline:1},events:{
    onReady:()=>{playerReady=true;player.setVolume(Number($("#volume").value));if(current?.id){player.loadVideoById(current.id);player.playVideo()}},
    onStateChange:onPlayerStateChange,
    onError:()=>toast("YouTube bu videoyu oynatamadı. Başka bir sonuç deneyelim.")
  }});
}
function findTrack(id){return [...queue,...favs,...history].find(x=>x.id===id)}
function openTrackScreen(t=current){if(!t?.id)return;screenTrack=t;const screen=$("#trackScreen");if(!screen)return;$("#trackBackdrop").style.backgroundImage=`url("${t.thumbnail}")`;$("#trackScreenArt").style.backgroundImage=`url("${t.thumbnail}")`;$("#trackScreenTitle").textContent=t.title;$("#trackScreenArtist").textContent=t.artist;$("#trackScreenYear").textContent=t.publishedAt?new Date(t.publishedAt).getFullYear()+" • VYRA MUSIC":"VYRA MUSIC";$("#trackScreenLike").textContent=favs.some(x=>x.id===t.id)?"♥":"♡";screen.classList.add("open");screen.setAttribute("aria-hidden","false");$("#trackScreenPlay").textContent=playing&&current?.id===t.id?"Ⅱ":"▶"}
function closeTrackScreen(){const x=$("#trackScreen");if(x){x.classList.remove("open");x.setAttribute("aria-hidden","true")}}
function updateScreenProgress(){if(!playerReady||!player?.getDuration)return;const d=player.getDuration()||0,v=player.getCurrentTime()||0,x=$("#screenProgress");if(x){x.max=d||100;x.value=v;x.style.setProperty("--progress",d?(v/d*100)+"%":"0%")}$("#screenCurrent").textContent=formatTime(v);$("#screenDuration").textContent=formatTime(d)}

window.onYouTubeIframeAPIReady=onYouTubeIframeAPIReady;

function onPlayerStateChange(event){
  if(event.data===YT.PlayerState.PLAYING){playing=true;$("#trackScreenPlay")?.textContent="Ⅱ";$("#playBtn").textContent="Ⅱ";$(".player")?.classList.add("is-playing");startProgress()}
  else if(event.data===YT.PlayerState.PAUSED){playing=false;$("#trackScreenPlay")?.textContent="▶";$("#playBtn").textContent="▶";$(".player")?.classList.remove("is-playing");stopProgress()}
  else if(event.data===YT.PlayerState.ENDED){playing=false;$("#playBtn").textContent="▶";$(".player")?.classList.remove("is-playing");stopProgress();nextTrack()}
}
function startProgress(){stopProgress();progressTimer=setInterval(()=>{if(!playerReady||!player?.getDuration)return;const duration=player.getDuration()||0,currentTime=player.getCurrentTime()||0;$("#progress").max=duration||100;$("#progress").value=currentTime;$("#progress").style.setProperty("--progress",duration?((currentTime/duration)*100)+"%":"0%");$("#currentTime").textContent=formatTime(currentTime);$("#duration").textContent=formatTime(duration);updateScreenProgress()},100)}
function stopProgress(){clearInterval(progressTimer);progressTimer=null}

function playTrack(t,index=-1){
  if(!t?.id)return;
  current=t;
  if(index>=0)queueIndex=index;else{const existing=queue.findIndex(x=>x.id===t.id);if(existing>=0)queueIndex=existing;else{queue=[t];queueIndex=0}}
  $("#nowTitle").textContent=t.title;$("#nowArtist").textContent=t.artist;openTrackScreen(t);$("#nowArt").style.backgroundImage=`url("${t.thumbnail}")`;$("#nowArt").textContent="";$("#nowArt").classList.add("has-image");$("#youtubeLabel").textContent=t.title;document.title=t.title+" — VYRA";addHistory(t);updateLikeButton();
  if(!playerReady){toast("Player hazırlanıyor…");return}
  player.loadVideoById(t.id);player.setVolume(Number($("#volume").value));player.playVideo()
}
function togglePlayback(){if(!current){if(queue.length)playTrack(queue[0],0);else toast("Önce bir YouTube şarkısı seç");return}if(!playerReady)return;if(player.getPlayerState()===YT.PlayerState.PLAYING)player.pauseVideo();else player.playVideo()}
function nextTrack(){if(!queue.length)return;queueIndex=(queueIndex+1)%queue.length;playTrack(queue[queueIndex],queueIndex)}
function prevTrack(){if(!queue.length)return;if(playerReady&&player.getCurrentTime()>5){player.seekTo(0,true);return}queueIndex=(queueIndex-1+queue.length)%queue.length;playTrack(queue[queueIndex],queueIndex)}

async function youtubeSearch(query,limit=12){
  if(!isConfigured())throw new Error("YouTube API anahtarı app.js içine eklenmemiş.");
  const url=new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part","snippet");url.searchParams.set("q",query);url.searchParams.set("type","video");url.searchParams.set("videoCategoryId","10");url.searchParams.set("maxResults",String(limit));url.searchParams.set("safeSearch","none");url.searchParams.set("key",YOUTUBE_API_KEY);
  const response=await fetch(url);const data=await response.json();if(!response.ok||data.error)throw new Error(data.error?.message||"YouTube API isteği başarısız.");
  return(data.items||[]).map(trackFromVideo).filter(x=>x.id)
}
async function doSearch(q){
  q=q.trim();if(!q)return;page("search");$("#searchStatus").textContent="YouTube aranıyor…";$("#results").innerHTML="<div class='loading'>♪ Sonuçlar getiriliyor...</div>";
  try{const tracks=await youtubeSearch(q,15);queue=tracks;queueIndex=-1;$("#searchStatus").textContent=tracks.length+" sonuç bulundu";$("#results").innerHTML=tracks.length?tracks.map(result).join(""):"<p class='empty'>Bu aramayla sonuç bulunamadı.</p>"}
  catch(error){console.error(error);$("#searchStatus").textContent="";$("#results").innerHTML=`<div class="api-warning"><b>YouTube bağlantısı hazır değil.</b><p>${escapeHtml(error.message)}</p><small>app.js içindeki YOUTUBE_API_KEY alanına kendi anahtarını ekle.</small></div>`}
}
async function loadFeatured(){
  if(!isConfigured()){const demo=[{title:"Lofi Beats",artist:"VYRA Discovery",emoji:"☁"},{title:"Phonk Mix",artist:"VYRA Discovery",emoji:"⚡"},{title:"Türkçe Pop",artist:"VYRA Discovery",emoji:"♫"},{title:"Night Drive",artist:"VYRA Discovery",emoji:"☾"}];$("#featured").innerHTML=demo.map(x=>`<article class="card demo-card"><div class="cover">${x.emoji}</div><b>${x.title}</b><small>${x.artist}</small></article>`).join("");$("#discoverGrid").innerHTML="<div class='api-warning'><b>Keşfet hazır.</b><p>YouTube sonuçlarını göstermek için API anahtarını app.js'e ekle.</p></div>";return}
  try{const tracks=await youtubeSearch("music 2026",8);queue=tracks;$("#featured").innerHTML=tracks.slice(0,4).map(card).join("");$("#discoverGrid").innerHTML=tracks.map(card).join("")}catch(e){$("#featured").innerHTML="<div class='api-warning'>YouTube sonuçları yüklenemedi.</div>";$("#discoverGrid").innerHTML=""}
}

$("#searchInput").addEventListener("keydown",e=>{if(e.key==="Enter"){$("#bigSearch").value=e.target.value;doSearch(e.target.value)}});
$("#bigSearchBtn").onclick=()=>doSearch($("#bigSearch").value);$("#bigSearch").onkeydown=e=>{if(e.key==="Enter")doSearch(e.target.value)};
$("#startBtn").onclick=()=>{page("search");$("#bigSearch").value="popular music";doSearch("popular music")};
$("#playBtn").onclick=togglePlayback;$("#nextBtn").onclick=nextTrack;$("#prevBtn").onclick=prevTrack;$("#likeBtn").onclick=()=>current&&toggleFav(current);
$("#progress").oninput=e=>{const v=Number(e.target.value)||0;const max=Number(e.target.max)||100;e.target.style.setProperty("--progress",((v/max)*100)+"%");if(playerReady)player.seekTo(v,true)};$("#volume").oninput=e=>{if(playerReady)player.setVolume(Number(e.target.value))};
$("#newPlaylist").onclick=openCreatePlaylist;$("#libraryNewPlaylist").onclick=openCreatePlaylist;$("#playlistCreateSubmit").onclick=()=>{const p=createPlaylist($("#playlistNameInput").value);if(p)closeModal("playlistCreateModal")};$("#playlistNameInput").onkeydown=e=>{if(e.key==="Enter")$("#playlistCreateSubmit").click()};$("#pickerNewPlaylist").onclick=()=>{closeModal("playlistPickerModal");openCreatePlaylist()};$("[data-close-modal]").forEach(b=>b.onclick=()=>closeModal(b.dataset.closeModal));$("#playlistViewClose").onclick=closePlaylistView;$("#playlistPlayAll").onclick=()=>playPlaylist(false);$("#playlistShuffle").onclick=()=>playPlaylist(true);
$("#closeYoutube").onclick=()=>$("#youtubeDock").classList.remove("open");$("#mobileMenu").onclick=()=>$(".sidebar").classList.toggle("open");
$("#profileBtn").onclick=()=>{$("#profilePanel").classList.add("open");updateProfileStats()};
$("#trackScreenClose").onclick=closeTrackScreen;$("#trackScreenPlay").onclick=()=>{if(screenTrack){if(current?.id!==screenTrack.id)playTrack(screenTrack);else togglePlayback()}};$("#screenPlaySmall").onclick=()=>{if(screenTrack){if(current?.id!==screenTrack.id)playTrack(screenTrack);else togglePlayback()}};$("#screenPrev").onclick=prevTrack;$("#screenNext").onclick=nextTrack;
$("#trackScreenLike").onclick=()=>{if(screenTrack){toggleFav(screenTrack);openTrackScreen(screenTrack)}};
$("#trackScreenAdd").onclick=()=>{if(screenTrack)openPicker(screenTrack)};
$("#screenProgress").oninput=e=>{const v=Number(e.target.value)||0,max=Number(e.target.max)||100;e.target.style.setProperty("--progress",((v/max)*100)+"%");if(playerReady)player.seekTo(v,true)};
$("#profileClose").onclick=()=>$("#profilePanel").classList.remove("open");
$("#profileLibrary").onclick=()=>{$("#profilePanel").classList.remove("open");page("library")};
$("#nowArt").onclick=()=>openTrackScreen(current);
setTimeout(()=>$("#splash")?.classList.add("hide"),1400);
$$(".nav,.mobile-nav button").forEach(b=>b.onclick=()=>page(b.dataset.page));$$("[data-page-target]").forEach(b=>b.onclick=()=>page(b.dataset.pageTarget));
$$(".chips button").forEach(b=>b.onclick=()=>{$("#bigSearch").value=b.dataset.query;doSearch(b.dataset.query)});
$$(".library-tabs button").forEach(b=>b.onclick=()=>{$$(".library-tabs button").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");renderLibrary(b.dataset.libraryTab)});
document.addEventListener("click",e=>{const pick=e.target.closest("[data-pick-playlist]")?.dataset.pickPlaylist,open=e.target.closest("[data-open-playlist]")?.dataset.openPlaylist,side=e.target.closest("[data-playlist-id]")?.dataset.playlistId,pt=e.target.closest("[data-playlist-track]")?.dataset.playlistTrack,rm=e.target.closest("[data-remove-playlist-track]")?.dataset.removePlaylistTrack,create=e.target.closest("[data-create-playlist]");if(pick){addToPlaylist(pick);return}if(open){openPlaylist(open);return}if(side){openPlaylist(side);return}if(pt){const p=playlistById(activePlaylistId),t=p?.tracks.find(x=>x.id===pt);if(t){queue=[...p.tracks];queueIndex=p.tracks.indexOf(t);playTrack(t,queueIndex)}return}if(rm){removeFromPlaylist(rm);return}if(create){openCreatePlaylist();return}const playId=e.target.closest("[data-play-id]")?.dataset.playId,likeId=e.target.closest("[data-like-id]")?.dataset.likeId,detailId=e.target.closest("[data-detail-id]")?.dataset.detailId,cardEl=e.target.closest(".card");if(detailId){const t=findTrack(detailId);if(t)openTrackScreen(t);return}if(playId){const t=[...queue,...favs,...history].find(x=>x.id===playId);if(t)playTrack(t);return}if(likeId){const t=[...queue,...favs,...history].find(x=>x.id===likeId);if(t)toggleFav(t);return}if(cardEl?.dataset.id){const t=queue.find(x=>x.id===cardEl.dataset.id);if(t)openTrackScreen(t)}});
render();updateProfileStats();loadFeatured();
