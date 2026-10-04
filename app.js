const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const YOUTUBE_API_KEY = "AIzaSyAPcOxJ9CBs75V-WSXg7v0YnYW-FAuCxe8";

let current=null, playing=false, queue=[], queueIndex=-1, player=null, playerReady=false, progressTimer=null;
let favs=JSON.parse(localStorage.getItem("vyraFavs")||"[]");
let history=JSON.parse(localStorage.getItem("vyraHistory")||"[]");
let lists=JSON.parse(localStorage.getItem("vyraLists")||"[]");

function toast(message){const x=$("#toast");x.textContent=message;x.classList.add("show");clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>x.classList.remove("show"),2200)}
function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function isConfigured(){return YOUTUBE_API_KEY&&!YOUTUBE_API_KEY.includes("YOUR_")}
function formatTime(seconds){seconds=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0")}
function trackFromVideo(item){const s=item.snippet||{};return{id:item.id?.videoId||item.id,title:s.title||"Bilinmeyen şarkı",artist:s.channelTitle||"YouTube",thumbnail:s.thumbnails?.high?.url||s.thumbnails?.medium?.url||s.thumbnails?.default?.url||"",publishedAt:s.publishedAt||""}}
function card(t){return `<article class="card" data-id="${escapeHtml(t.id)}"><div class="cover image-cover" style="background-image:url('${escapeHtml(t.thumbnail)}')"></div><b title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</b><small>${escapeHtml(t.artist)}</small></article>`}
function result(t){const liked=favs.some(x=>x.id===t.id);return `<div class="result"><button class="result-main" data-play-id="${escapeHtml(t.id)}"><img class="thumb thumb-image" src="${escapeHtml(t.thumbnail)}" alt=""><span class="meta"><b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.artist)}</small></span></button><button class="result-play" data-play-id="${escapeHtml(t.id)}">▶</button><button class="result-like" data-like-id="${escapeHtml(t.id)}">${liked?"♥":"♡"}</button></div>`}
function render(){ $("#playlistList").innerHTML=lists.map(x=>`<div>♫ ${escapeHtml(x)}</div>`).join("");renderLibrary("favorites")}
function renderLibrary(tab){const box=$("#libraryContent");if(tab==="favorites")box.innerHTML=favs.length?favs.map(result).join(""):"<p class='empty'>Henüz favorin yok. Bir şarkının ♡ düğmesine bas.</p>";else if(tab==="history")box.innerHTML=history.length?history.map(result).join(""):"<p class='empty'>Henüz dinleme geçmişin yok.</p>";else box.innerHTML=lists.length?lists.map(x=>`<div class="playlist-row">♫ <b>${escapeHtml(x)}</b></div>`).join(""):"<p class='empty'>Henüz çalma listen yok.</p>"}
function page(id){$$(".page").forEach(x=>x.classList.remove("active-page"));$("#"+id)?.classList.add("active-page");$$(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===id));if(innerWidth<901)$(".sidebar")?.classList.remove("open")}
function saveState(){localStorage.setItem("vyraFavs",JSON.stringify(favs));localStorage.setItem("vyraHistory",JSON.stringify(history));localStorage.setItem("vyraLists",JSON.stringify(lists))}
function addHistory(t){history=[t,...history.filter(x=>x.id!==t.id)].slice(0,30);saveState()}
function toggleFav(t){const i=favs.findIndex(x=>x.id===t.id);if(i>=0){favs.splice(i,1);toast("Favorilerden çıkarıldı")}else{favs.unshift(t);toast("♥ Favorilere eklendi")}saveState();updateLikeButton();renderLibrary("favorites")}
function updateLikeButton(){if(!current)return;$("#likeBtn").textContent=favs.some(x=>x.id===current.id)?"♥":"♡";updateProfileStats()}
function updateProfileStats(){$("#favCount")?.replaceChildren(document.createTextNode(favs.length));$("#historyCount")?.replaceChildren(document.createTextNode(history.length));$("#playlistCount")?.replaceChildren(document.createTextNode(lists.length))}
function openTrackModal(t=current){if(!t?.id)return;$("#trackModalArt").style.backgroundImage=`url("${t.thumbnail}")`;$("#trackModalTitle").textContent=t.title;$("#trackModalArtist").textContent=t.artist;$("#trackModal").classList.add("open");$("#trackModalLike").textContent=favs.some(x=>x.id===t.id)?"♥ Favorilerde":"♡ Favoriye ekle";$("#trackModalPlay").onclick=()=>{playTrack(t);$("#trackModal").classList.remove("open")};$("#trackModalLike").onclick=()=>{toggleFav(t);openTrackModal(t)}}
function closeTrackModal(){$("#trackModal")?.classList.remove("open")}

function onYouTubeIframeAPIReady(){
  player=new YT.Player("youtubePlayer",{width:"100%",height:"100%",videoId:"",playerVars:{autoplay:0,controls:1,rel:0,modestbranding:1,playsinline:1},events:{
    onReady:()=>{playerReady=true;player.setVolume(Number($("#volume").value));if(current?.id){player.loadVideoById(current.id);player.playVideo()}},
    onStateChange:onPlayerStateChange,
    onError:()=>toast("YouTube bu videoyu oynatamadı. Başka bir sonuç deneyelim.")
  }});
}
window.onYouTubeIframeAPIReady=onYouTubeIframeAPIReady;

function onPlayerStateChange(event){
  if(event.data===YT.PlayerState.PLAYING){playing=true;$("#playBtn").textContent="Ⅱ";$(".player")?.classList.add("is-playing");startProgress()}
  else if(event.data===YT.PlayerState.PAUSED){playing=false;$("#playBtn").textContent="▶";$(".player")?.classList.remove("is-playing");stopProgress()}
  else if(event.data===YT.PlayerState.ENDED){playing=false;$("#playBtn").textContent="▶";$(".player")?.classList.remove("is-playing");stopProgress();nextTrack()}
}
function startProgress(){stopProgress();progressTimer=setInterval(()=>{if(!playerReady||!player?.getDuration)return;const duration=player.getDuration()||0,currentTime=player.getCurrentTime()||0;$("#progress").max=duration||100;$("#progress").value=currentTime;$("#progress").style.setProperty("--progress",duration?((currentTime/duration)*100)+"%":"0%");$("#currentTime").textContent=formatTime(currentTime);$("#duration").textContent=formatTime(duration)},100)}
function stopProgress(){clearInterval(progressTimer);progressTimer=null}

function playTrack(t,index=-1){
  if(!t?.id)return;
  current=t;
  if(index>=0)queueIndex=index;else{const existing=queue.findIndex(x=>x.id===t.id);if(existing>=0)queueIndex=existing;else{queue=[t];queueIndex=0}}
  $("#nowTitle").textContent=t.title;$("#nowArtist").textContent=t.artist;$("#nowArt").style.backgroundImage=`url("${t.thumbnail}")`;$("#nowArt").textContent="";$("#nowArt").classList.add("has-image");$("#youtubeLabel").textContent=t.title;document.title=t.title+" — VYRA";addHistory(t);updateLikeButton();
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
$("#newPlaylist").onclick=()=>{const name=prompt("Çalma listesine isim ver:");if(!name?.trim())return;lists.push(name.trim());saveState();render();toast("Liste oluşturuldu")};
$("#closeYoutube").onclick=()=>$("#youtubeDock").classList.remove("open");$("#mobileMenu").onclick=()=>$(".sidebar").classList.toggle("open");
$("#profileBtn").onclick=()=>{$("#profilePanel").classList.add("open");updateProfileStats()};
$("#profileClose").onclick=()=>$("#profilePanel").classList.remove("open");
$("#profileLibrary").onclick=()=>{$("#profilePanel").classList.remove("open");page("library")};
$("#trackClose").onclick=closeTrackModal;
$("#trackModal").addEventListener("click",e=>{if(e.target.id==="trackModal")closeTrackModal()});
$("#nowArt").onclick=()=>openTrackModal(current);
setTimeout(()=>$("#splash")?.classList.add("hide"),1400);
$$(".nav,.mobile-nav button").forEach(b=>b.onclick=()=>page(b.dataset.page));$$("[data-page-target]").forEach(b=>b.onclick=()=>page(b.dataset.pageTarget));
$$(".chips button").forEach(b=>b.onclick=()=>{$("#bigSearch").value=b.dataset.query;doSearch(b.dataset.query)});
$$(".library-tabs button").forEach(b=>b.onclick=()=>{$$(".library-tabs button").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");renderLibrary(b.dataset.libraryTab)});
document.addEventListener("click",e=>{const playId=e.target.closest("[data-play-id]")?.dataset.playId,likeId=e.target.closest("[data-like-id]")?.dataset.likeId,cardEl=e.target.closest(".card");if(playId){const t=[...queue,...favs,...history].find(x=>x.id===playId);if(t)playTrack(t);return}if(likeId){const t=[...queue,...favs,...history].find(x=>x.id===likeId);if(t)toggleFav(t);return}if(cardEl?.dataset.id){const t=queue.find(x=>x.id===cardEl.dataset.id);if(t)playTrack(t)}});
render();updateProfileStats();loadFeatured();
