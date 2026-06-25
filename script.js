(function(){
  "use strict";

  var BANK = [];
  var CATS = {G:"Généralités", P:"Personnes", B:"Biens", PR:"Procédure"};
  var SKEY = "penalci_stats_v1", BKEY = "penalci_best_v2";
  var EXAM_N = 20;

  function load(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
  function save(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  var stats = load(SKEY, {});
  var best = load(BKEY, {quiz:0, duel:0, exam:0});

  function statOf(id){ return stats[id] || (stats[id]={seen:0, wrong:0}); }
  function weight(id){ var s=statOf(id); var rate=s.seen?s.wrong/s.seen:0; var fresh=s.seen?0:0.6; return 1+2.2*rate+fresh; }
  function shuffle(a){ for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function poolFor(cat){ return BANK.filter(function(q){ return cat==="all" || q.cat===cat; }); }
  function pickWeighted(pool, lastId){
    var cands=pool.filter(function(q){ return q.id!==lastId; });
    if(!cands.length) cands=pool.slice();
    var total=0, ws=cands.map(function(q){ var w=weight(q.id); total+=w; return w; });
    var r=Math.random()*total;
    for(var i=0;i<cands.length;i++){ r-=ws[i]; if(r<=0) return cands[i]; }
    return cands[cands.length-1];
  }
  function record(id, correct){ var s=statOf(id); s.seen++; if(!correct) s.wrong++; else s.wrong=Math.max(0,s.wrong-1); save(SKEY,stats); }
  function fmt(s){ var m=Math.floor(s/60), ss=s%60; return m+":"+(ss<10?"0":"")+ss; }

  var $ = function(id){ return document.getElementById(id); };
  var screens = ["menu","play","cards","result"];
  function show(name){
    screens.forEach(function(s){ $(s).hidden=(s!==name); });
    var cur=$(name); cur.classList.remove("enter"); void cur.offsetWidth; cur.classList.add("enter");
    window.scrollTo(0,0);
  }
  function pulse(el){ if(!el) return; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
  function setText(id,v){ var el=$(id); if(el) el.textContent=v; }

  function toast(msg){
    var t=$("toast"); t.textContent=msg; t.hidden=false; void t.offsetWidth; t.classList.add("on");
    clearTimeout(t._t); t._t=setTimeout(function(){ t.classList.remove("on"); setTimeout(function(){ t.hidden=true; },300); }, 2200);
  }

  var curCat="all";
  $("chips").addEventListener("click", function(e){
    var b=e.target.closest(".chip"); if(!b) return;
    curCat=b.dataset.cat;
    [].forEach.call(this.querySelectorAll(".chip"), function(c){ c.setAttribute("aria-pressed", c===b?"true":"false"); });
  });
  function refreshBest(){
    setText("best-quiz", best.quiz||0); setText("best-duel", best.duel||0);
    setText("best-exam", best.exam ? (best.exam+"/20") : "—");
  }
  $("reset").addEventListener("click", function(){
    if(confirm("Effacer la progression et les meilleurs scores ?")){
      stats={}; best={quiz:0,duel:0,exam:0}; save(SKEY,stats); save(BKEY,best); refreshBest();
    }
  });

  function startMode(mode){
    var pool=poolFor(curCat);
    if(!pool.length){ toast("Aucune question dans ce thème."); return; }
    if(mode==="quiz") startQuiz(pool);
    else if(mode==="duel") startDuel(pool);
    else if(mode==="exam") startExam(pool);
    else startCards(pool);
  }

  // ---------- HUD ----------
  function renderHud(mode){
    var h=$("p-hud");
    if(mode==="quiz"){
      h.innerHTML='<div class="lhs"><div class="pill"><span>Score</span><strong id="p-score">0</strong></div><div class="pill"><span>Série</span><strong id="p-streak">0</strong></div></div><div class="lives" id="p-lives" aria-label="vies"></div>';
    } else if(mode==="duel"){
      h.innerHTML='<div class="lhs"><div class="pill"><span>Score</span><strong id="p-score">0</strong></div><div class="pill"><span>Série</span><strong id="p-streak">0</strong></div></div><div class="pill"><span>Temps</span><strong id="p-time">60</strong></div>';
    } else {
      h.innerHTML='<div class="lhs"><div class="pill"><span>Question</span><strong id="p-prog">1</strong></div></div><div class="pill"><span>Temps</span><strong id="p-time">--</strong></div>';
    }
  }
  function drawLives(n){
    var el=$("p-lives"); if(!el) return; el.innerHTML="";
    for(var i=0;i<3;i++){
      el.insertAdjacentHTML("beforeend",
        '<svg class="heart" viewBox="0 0 24 24" fill="'+(i<n?'#9B2226':'none')+'" stroke="#9B2226" stroke-width="1.6" aria-hidden="true"><path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3 1.2 4 2.5 1-1.3 2-2.5 4-2.5 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21z"/></svg>');
    }
  }

  // ---------- render (quiz + duel) ----------
  function renderQuestion(item, onPick){
    setText("p-tag", CATS[item.cat]||"Question"); setText("p-q", item.q);
    var fb=$("p-fb"); fb.style.display="none"; fb.className="fb";
    $("p-next").style.display="none";
    var box=$("p-opts"); box.innerHTML="";
    var arr=item.o.map(function(t,i){ return {t:t, ok:i===item.c}; }); shuffle(arr);
    arr.forEach(function(op,i){
      var b=document.createElement("button");
      b.className="opt"; b.textContent=op.t; b.style.animationDelay=(i*0.05)+"s";
      b.addEventListener("click", function(){ onPick(op.ok, b, box, item); });
      box.appendChild(b);
    });
  }
  function reveal(box, picked, item, correct){
    [].forEach.call(box.querySelectorAll(".opt"), function(b){
      b.disabled=true;
      if(item.o[item.c]===b.textContent) b.classList.add("ok");
      else if(b===picked) b.classList.add("no");
      else b.classList.add("dim");
    });
    var fb=$("p-fb"); fb.className="fb "+(correct?"good":"bad");
    fb.innerHTML=(correct?"<strong>Correct.</strong> ":"<strong>Raté.</strong> ")+item.e; fb.style.display="block";
    if(!correct){ var c=$("p-card"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake"); }
  }

  // ---------- QUIZ ----------
  var ROUND=12, qScore, qStreak, qLives, qLast, qAnswered;
  function startQuiz(pool){
    qScore=0; qStreak=0; qLives=3; qLast=null; qAnswered=0;
    show("play"); $("p-timerbar").hidden=true; renderHud("quiz"); drawLives(qLives);
    nextQuiz(pool);
  }
  function nextQuiz(pool){
    var item=pickWeighted(pool,qLast); qLast=item.id;
    setText("p-score",qScore); setText("p-streak",qStreak);
    renderQuestion(item, function(ok, btn, box){
      record(item.id, ok);
      if(ok){ qStreak++; qScore+=10+Math.min(qStreak,5)*2; pulse($("p-streak")); }
      else { qStreak=0; qLives--; }
      setText("p-score",qScore); setText("p-streak",qStreak); drawLives(qLives);
      reveal(box, btn, item, ok); qAnswered++;
      var nx=$("p-next");
      nx.textContent=(qLives<=0||qAnswered>=ROUND)?"Voir le résultat":"Continuer";
      nx.style.display="block"; nx.focus();
      nx.onclick=function(){ if(qLives<=0||qAnswered>=ROUND){ endQuiz(); } else nextQuiz(pool); };
    });
  }
  function endQuiz(){
    if(qScore>(best.quiz||0)){ best.quiz=qScore; save(BKEY,best); refreshBest(); }
    var maxApprox=qAnswered*20, pct=maxApprox?Math.round(qScore/maxApprox*100):0;
    showResult({ title:qLives<=0?"Plus de vies":"Quiz terminé", score:qScore,
      sub:"Répondu : "+qAnswered+" · vies restantes : "+qLives,
      verdict:pct>=80?"Excellent — tu es prête.":pct>=55?"Bien — encore quelques articles à fixer.":"À retravailler : revois les fiches, puis rejoue.",
      again:function(){ startQuiz(poolFor(curCat)); },
      share:"J'ai marqué "+qScore+" au quiz de Code pénal (concours magistrature). "+location.href });
  }

  // ---------- DUEL ----------
  var dTimer, dLeft, dScore, dStreak, dLast, dCount, dPool, dOver;
  function startDuel(pool){
    dPool=pool; dScore=0; dStreak=0; dLeft=60; dLast=null; dCount=0; dOver=false;
    show("play"); renderHud("duel");
    $("p-timerbar").hidden=false; $("p-timerfill").style.width="100%";
    clearInterval(dTimer);
    dTimer=setInterval(function(){ dLeft--; setText("p-time",Math.max(0,dLeft));
      $("p-timerfill").style.width=Math.max(0,(dLeft/60*100))+"%"; if(dLeft<=0) endDuel(); },1000);
    nextDuel();
  }
  function nextDuel(){
    if(dOver||dLeft<=0) return;
    var item=pickWeighted(dPool,dLast); dLast=item.id;
    setText("p-score",dScore); setText("p-streak",dStreak);
    renderQuestion(item, function(ok, btn, box){
      record(item.id, ok); dCount++;
      if(ok){ dStreak++; dScore+=10+Math.min(dStreak,5)*2; pulse($("p-streak")); }
      else { dStreak=0; dLeft=Math.max(0,dLeft-3); setText("p-time",dLeft); $("p-timerfill").style.width=(dLeft/60*100)+"%"; }
      setText("p-score",dScore); setText("p-streak",dStreak);
      reveal(box, btn, item, ok);
      if(dLeft<=0){ endDuel(); return; }
      setTimeout(nextDuel, ok?550:1150);
    });
  }
  function endDuel(){
    if(dOver) return; dOver=true; clearInterval(dTimer);
    if(dScore>(best.duel||0)){ best.duel=dScore; save(BKEY,best); refreshBest(); }
    showResult({ title:"Temps écoulé", score:dScore, sub:"Questions traitées : "+dCount,
      verdict:dScore>=200?"Redoutable de vitesse.":dScore>=110?"Bon rythme, continue.":"Encore un tour pour gagner en réflexe.",
      again:function(){ startDuel(poolFor(curCat)); },
      share:"J'ai marqué "+dScore+" au duel chronométré de Code pénal. "+location.href });
  }

  // ---------- EXAMEN BLANC ----------
  var examTimer, examLeft, examTime, examSet, examIdx, examAnswers, examSel, examOver;
  function buildExamSet(pool, n){
    n=Math.min(n, pool.length); var picks=[], used={}, safety=0;
    while(picks.length<n && safety<3000){ var q=pickWeighted(pool,null); safety++; if(!used[q.id]){ used[q.id]=1; picks.push(q); } }
    return shuffle(picks);
  }
  function startExam(pool){
    examSet=buildExamSet(pool, EXAM_N); examIdx=0; examAnswers=[]; examSel=null; examOver=false;
    examTime=Math.max(120, examSet.length*30); examLeft=examTime;
    show("play"); renderHud("exam");
    $("p-timerbar").hidden=false; $("p-timerfill").style.width="100%";
    $("p-fb").style.display="none";
    clearInterval(examTimer);
    examTimer=setInterval(function(){ examLeft--; updateExamTime(); if(examLeft<=0) endExam(); },1000);
    updateExamTime(); renderExam();
  }
  function updateExamTime(){ setText("p-time", fmt(Math.max(0,examLeft))); $("p-timerfill").style.width=Math.max(0,(examLeft/examTime*100))+"%"; }
  function renderExam(){
    var item=examSet[examIdx]; examSel=null;
    setText("p-prog", (examIdx+1)+"/"+examSet.length);
    setText("p-tag", CATS[item.cat]||"Question"); setText("p-q", item.q);
    $("p-fb").style.display="none";
    var box=$("p-opts"); box.innerHTML="";
    var arr=item.o.map(function(t,i){ return {t:t, ok:i===item.c}; }); shuffle(arr);
    arr.forEach(function(op,i){
      var b=document.createElement("button");
      b.className="opt"; b.textContent=op.t; b.style.animationDelay=(i*0.05)+"s";
      b.addEventListener("click", function(){
        [].forEach.call(box.querySelectorAll(".opt"), function(x){ x.classList.remove("sel"); });
        b.classList.add("sel"); examSel={ok:op.ok, t:op.t};
      });
      box.appendChild(b);
    });
    var nx=$("p-next");
    nx.textContent=(examIdx+1>=examSet.length)?"Terminer l'examen":"Suivant";
    nx.style.display="block";
    nx.onclick=function(){
      examAnswers[examIdx]=examSel;
      if(examIdx+1>=examSet.length){ endExam(); }
      else { examIdx++; renderExam(); }
    };
  }
  function endExam(){
    if(examOver) return; examOver=true; clearInterval(examTimer);
    while(examAnswers.length<examSet.length) examAnswers.push(null);
    var correct=0;
    examSet.forEach(function(item,i){ var a=examAnswers[i]; var ok=!!(a&&a.ok); if(ok) correct++; record(item.id, ok); });
    var note=Math.round(correct/examSet.length*20*10)/10;
    if(note>(best.exam||0)){ best.exam=note; save(BKEY,best); refreshBest(); }
    var used=examTime-Math.max(0,examLeft);
    var review=document.createElement("div");
    examSet.forEach(function(item,i){
      var a=examAnswers[i]; var ok=!!(a&&a.ok); var good=item.o[item.c];
      var d=document.createElement("div"); d.className="rev-item"+(ok?"":" bad");
      var q=document.createElement("p"); q.className="rev-q"; q.textContent=(i+1)+". "+item.q; d.appendChild(q);
      var yl=document.createElement("p"); yl.className="rev-line";
      yl.appendChild(document.createTextNode("Ta réponse : "));
      var ys=document.createElement("span"); ys.className=ok?"good":"you"; ys.textContent=a?a.t:"non répondu"; yl.appendChild(ys);
      d.appendChild(yl);
      if(!ok){ var gl=document.createElement("p"); gl.className="rev-line";
        gl.appendChild(document.createTextNode("Bonne réponse : "));
        var gs=document.createElement("span"); gs.className="good"; gs.textContent=good; gl.appendChild(gs); d.appendChild(gl); }
      var ex=document.createElement("p"); ex.className="rev-exp"; ex.textContent=item.e; d.appendChild(ex);
      review.appendChild(d);
    });
    var verdict = note>=14?"Admissible — très bon niveau.":note>=10?"La moyenne est là, consolide les points faibles.":"En dessous de la moyenne : reprends les fiches puis recommence.";
    showResult({ title:"Examen terminé", scoreText:note+"/20",
      sub:correct+" bonnes réponses sur "+examSet.length+" · temps : "+fmt(used),
      verdict:verdict, reviewNode:review,
      again:function(){ startExam(poolFor(curCat)); },
      share:"J'ai eu "+note+"/20 à l'examen blanc de Code pénal (concours magistrature). "+location.href });
  }

  // ---------- CARDS ----------
  var deck, cIdx;
  function startCards(pool){
    deck=shuffle(pool.slice()).sort(function(a,b){ return weight(b.id)-weight(a.id); }).slice(0, Math.min(15, pool.length));
    cIdx=0; show("cards"); renderCard();
  }
  function renderCard(){
    var item=deck[cIdx];
    setText("c-prog",(cIdx+1)+"/"+deck.length); setText("c-left", deck.length-cIdx);
    setText("c-front",item.q); setText("c-ans",item.o[item.c]); setText("c-exp",item.e);
    $("c-flash").classList.remove("flipped"); $("c-actions").hidden=true;
  }
  function flip(){ var f=$("c-flash"); f.classList.toggle("flipped"); $("c-actions").hidden=!f.classList.contains("flipped"); }
  $("c-flash").addEventListener("click", flip);
  $("c-flash").addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); flip(); } });
  function advance(){
    cIdx++;
    if(cIdx>=deck.length){
      showResult({ title:"Paquet terminé", score:deck.length, sub:"cartes revues",
        verdict:"Reprends un paquet : les cartes mal sues reviendront en premier.",
        again:function(){ startCards(poolFor(curCat)); } });
    } else renderCard();
  }
  $("c-known").addEventListener("click", function(){ record(deck[cIdx].id, true); advance(); });
  $("c-again").addEventListener("click", function(){ record(deck[cIdx].id, false); advance(); });
  $("c-quit").addEventListener("click", function(){ show("menu"); });

  // ---------- RESULT + SHARE ----------
  function copyText(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ toast("Score copié — tu peux le coller."); }, fallbackCopy);
    } else fallbackCopy();
    function fallbackCopy(){
      try{ var ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
        toast("Score copié — tu peux le coller."); }catch(e){ toast("Copie impossible sur cet appareil."); }
    }
  }
  function showResult(cfg){
    setText("r-title", cfg.title);
    $("r-score").textContent = cfg.scoreText!=null ? cfg.scoreText : (cfg.score!=null?cfg.score:"");
    setText("r-sub", cfg.sub||""); setText("r-verdict", cfg.verdict||"");
    var rev=$("r-review"); rev.innerHTML=""; if(cfg.reviewNode) rev.appendChild(cfg.reviewNode);
    show("result");
    $("r-again").onclick=cfg.again;
    $("r-menu").onclick=function(){ show("menu"); };
    var sb=$("r-share");
    if(cfg.share){
      sb.style.display=""; sb.onclick=function(){
        if(navigator.share){ navigator.share({title:"Code pénal — révision", text:cfg.share}).catch(function(){}); }
        else copyText(cfg.share);
      };
    } else sb.style.display="none";
  }
  $("p-quit").addEventListener("click", function(){ dOver=true; examOver=true; clearInterval(dTimer); clearInterval(examTimer); show("menu"); });

  // ---------- INIT (load questions) ----------
  function enableModes(){
    var m=$("modes"); m.setAttribute("aria-busy","false");
    [].forEach.call(m.querySelectorAll(".mode"), function(b){
      b.disabled=false;
      b.addEventListener("click", function(){ startMode(b.dataset.mode); });
    });
  }
  function init(){
    refreshBest();
    fetch("questions.json", {cache:"no-store"})
      .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
      .then(function(data){
        BANK=data; BANK.forEach(function(q,i){ q.id="q"+i; });
        enableModes();
        $("lead").className="lead";
        $("lead").textContent="Choisis un mode, puis un thème. Les questions ratées reviennent plus souvent.";
      })
      .catch(function(){
        $("lead").className="lead err";
        $("lead").textContent="Impossible de charger questions.json. Héberge le jeu (GitHub Pages, Netlify) ou lance un petit serveur local : l'ouverture directe du fichier (file://) bloque le chargement.";
      });
  }
  init();
})();
