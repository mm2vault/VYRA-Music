const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const tracks=[
 {title:"Midnight Bloom",artist:"VYRA Sessions",emoji:"✦"},
 {title:"Purple Skies",artist:"Neon Waves",emoji:"☾"},
 {title:"Afterglow",artist:"Luna Echo",emoji:"◉"},
 {title:"Night Drive",artist:"Velvet Rush",emoji:"◆"},
 {title:"Electric Dreams",artist:"Nova",emoji:"✧"},
 {title:"Slow Motion",artist:"Mira",emoji:"☁"},
 {title:"Lost in Tokyo",artist:"Kairo",emoji:"◎"},
 {title:"Moonlight",artist:"Aeris",emoji:"☽"}
];
let current=null,playing=false,favs=JSON.parse(localStorage.vyraFavs||"[]"),lists=JSON.parse(localStorage.vyraLists||"[]");
function toast(t){let x=$("#toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),1800)}
function card(t){return `<article class="card" data-title="${t.title}"><div class="cover">${t.emoji}</div><b>${t.title}</b><small>${t.artist}</small></article>`}
function result(t){return `<div class="result"><div class="thumb">${t.emoji}</div><div class="meta"><b>${t.title}</b><small>${t.artist}</small></div><button onclick='playTrack(${JSON.stringify(t)})'>▶</button><button onclick='toggleFav(${JSON.stringify(t)})'>♡</button></div>`}
function render(){ $("#featured").innerHTML=tracks.slice(0,4).map(card).join("");$("#discoverGrid").innerHTML=tracks.map(card).join("");$("#libraryContent").innerHTML=favs.length?favs.map(result).join(""):"<p style='color:#777'>Henüz favorin yok. Bir şarkının ♡ düğmesine bas.</p>";$("#playlistList").innerHTML=lists.map(x=>`<div>♫ ${x}</div>`).join("")}
function playTrack(t){current=t;playing=true;$("#nowTitle").textContent=t.title;$("#nowArtist").textContent=t.artist;$("#nowArt").textContent=t.emoji;$("#playBtn").textContent="Ⅱ";toast("▶ "+t.title);document.title=t.title+" — VYRA"}
function toggleFav(t){let i=favs.findIndex(x=>x.title===t.title);if(i>=0){favs.splice(i,1);toast("Favorilerden çıkarıldı")}else{favs.push(t);toast("♡ Favorilere eklendi")}localStorage.vyraFavs=JSON.stringify(favs);render()}
function page(id){$$(".page").forEach(x=>x.classList.remove("active-page"));$("#"+id).classList.add("active-page");$$(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===id));if(innerWidth<901)$("#sidebar")?.classList.remove("open")}
$$(".nav,.mobile-nav button").forEach(b=>b.onclick=()=>page(b.dataset.page));
$$("[data-page-target]").forEach(b=>b.onclick=()=>page(b.dataset.pageTarget));
$("#searchInput").onkeydown=e=>{if(e.key==="Enter"){page("search");$("#bigSearch").value=e.target.value;doSearch(e.target.value)}};
$("#bigSearchBtn").onclick=()=>doSearch($("#bigSearch").value);
$("#bigSearch").onkeydown=e=>{if(e.key==="Enter")doSearch(e.target.value)};
function doSearch(q){q=q.trim();let r=tracks.filter(t=>(t.title+" "+t.artist).toLowerCase().includes(q.toLowerCase()));if(!r.length)r=tracks;$("#results").innerHTML=r.map(result).join("");toast("Demo kataloğunda "+(q||"müzik")+" aranıyor")}
$("#startBtn").onclick=()=>playTrack(tracks[0]);
$("#playBtn").onclick=()=>{if(!current)playTrack(tracks[0]);else{playing=!playing;$("#playBtn").textContent=playing?"Ⅱ":"▶"}};
$("#likeBtn").onclick=()=>current&&toggleFav(current);
$("#newPlaylist").onclick=()=>{let n=prompt("Çalma listesine isim ver:");if(n){lists.push(n);localStorage.vyraLists=JSON.stringify(lists);render();toast("Liste oluşturuldu")}};
$$(".chips button").forEach(b=>b.onclick=()=>{page("search");$("#bigSearch").value=b.dataset.query;doSearch(b.dataset.query)});
$("#mobileMenu").onclick=()=>{let s=document.querySelector(".sidebar");s.classList.toggle("open")};
document.addEventListener("click",e=>{if(e.target.matches(".card")){let t=tracks.find(x=>x.title===e.target.dataset.title);if(t)playTrack(t)}});
render();
