// 게임 공통 소리: 효과음과 배경음악을 브라우저에서 직접 만든다(소리 파일 없음).
// SFX.play.good() 같은 식으로 쓰고, SFX.bindToggle(버튼)으로 소리 켜기·끄기 버튼을 연결한다.
window.SFX = (function () {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('game-muted') === '1'; } catch (e) { /* 저장 불가 */ }
  let bgmTimer = null;
  let bgmWanted = false;

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, when) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t = c.currentTime + (when || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  const play = {
    flip: () => tone(700, 0.07, 'triangle', 0.1),
    good: () => { tone(523, 0.12, 'sine', 0.18); tone(659, 0.12, 'sine', 0.18, 0.09); tone(784, 0.22, 'sine', 0.18, 0.18); },
    bad: () => { tone(233, 0.16, 'sawtooth', 0.07); tone(196, 0.26, 'sawtooth', 0.07, 0.12); },
    shoot: () => { tone(420, 0.06, 'square', 0.05); tone(260, 0.08, 'square', 0.04, 0.04); },
    pop: () => { tone(988, 0.08, 'triangle', 0.14); tone(1319, 0.1, 'triangle', 0.1, 0.05); },
    win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.28, 'sine', 0.16, i * 0.13)),
    tick: () => tone(1200, 0.03, 'square', 0.03),
  };

  // 배경음악: 밝은 5음 음계 멜로디 + 베이스를 반복(작은 소리)
  const MELODY = [72, 76, 79, 76, 74, 77, 81, 79, 72, 76, 79, 84, 81, 79, 76, 74,
    74, 77, 81, 77, 76, 79, 83, 79, 72, 76, 79, 76, 74, 72, 74, 72];
  const BASS = [48, 48, 53, 53, 50, 50, 55, 55];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let step = 0;
  function beat() {
    if (muted) return;
    const m = MELODY[step % MELODY.length];
    if (step % 8 !== 7) tone(hz(m), 0.22, 'triangle', 0.045);
    if (step % 4 === 0) tone(hz(BASS[(step / 4) % BASS.length]), 0.5, 'sine', 0.06);
    step++;
  }
  function bgm(on) {
    bgmWanted = on;
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    if (on && !muted) { ac(); bgmTimer = setInterval(beat, 230); }
  }

  const toggles = [];
  function paint() { toggles.forEach((b) => { b.textContent = muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'; b.setAttribute('aria-pressed', muted ? 'false' : 'true'); }); }
  function setMuted(v) {
    muted = v;
    try { localStorage.setItem('game-muted', v ? '1' : '0'); } catch (e) { /* 저장 불가 */ }
    if (v && bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    if (!v && bgmWanted) bgm(true);
    paint();
  }
  function bindToggle(btn) {
    toggles.push(btn);
    btn.onclick = () => { setMuted(!muted); ac(); };
    paint();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    else if (!document.hidden && bgmWanted) bgm(true);
  });

  return { play, bgm, bindToggle, unlock: ac };
})();
