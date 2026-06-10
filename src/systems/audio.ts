/**
 * Procedural WebAudio sound system for Tessera.
 *
 * All sounds are synthesised at runtime with oscillators + gain envelopes —
 * there are no external audio asset files. Exposed as the `Sound` singleton.
 *
 * SFX are gated by `Settings.sfx`, music by `Settings.music`. If the relevant
 * setting is off (or if the browser lacks WebAudio), the methods are no-ops.
 */
import { Settings } from "./settings";

/** Minimal typing for the legacy webkit-prefixed constructor. */
interface WebkitWindow {
  webkitAudioContext?: typeof AudioContext;
}

/** Simple waveform shape used by the helper note synth. */
type Wave = OscillatorType;

class SoundSystem {
  /** The shared audio context; null until init() succeeds (or unavailable). */
  private ctx: AudioContext | null = null;
  /** Master gain — keeps everything soft and pleasant for a casual game. */
  private master: GainNode | null = null;
  /** True once we've attempted (and failed) to create a context. */
  private unavailable = false;

  /** Music graph state. */
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  /** Absolute context time of the next scheduled music note. */
  private musicNextTime = 0;

  /** Master output level. Low by design — relaxing, never harsh. */
  private static readonly MASTER_LEVEL = 0.22;
  /** Background music sits well below SFX. */
  private static readonly MUSIC_LEVEL = 0.06;

  /**
   * Lazily create the AudioContext. Safe to call repeatedly; the game calls
   * this on the first user gesture so we also resume() to satisfy autoplay
   * policies. No-op if WebAudio is unavailable.
   */
  init(): void {
    if (this.unavailable) return;

    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as WebkitWindow).webkitAudioContext;
      if (!Ctor) {
        // Older browser without WebAudio — degrade to silent no-ops.
        this.unavailable = true;
        return;
      }
      try {
        this.ctx = new Ctor();
      } catch {
        this.unavailable = true;
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = SoundSystem.MASTER_LEVEL;
      this.master.connect(this.ctx.destination);
    }

    // Autoplay policy: contexts often start suspended until a user gesture.
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  // ---- Sound effects -------------------------------------------------------

  /** Short soft "thock" when a piece locks onto the board. */
  place(): void {
    if (!this.canSfx()) return;
    const t = this.now();
    // Low, quickly-decaying triangle blip with a soft pitch drop.
    this.note(220, t, 0.09, "triangle", 0.5, 140);
    this.note(110, t, 0.07, "sine", 0.35);
  }

  /** Satisfying clear sound; brighter / fuller with more lines cleared. */
  clear(lines: number): void {
    if (!this.canSfx()) return;
    const t = this.now();
    const n = Math.max(1, lines);
    // A small ascending major arpeggio; more lines => more notes & brightness.
    const base = 392; // G4
    const ratios = [1, 1.26, 1.5, 1.89, 2.0]; // ~major chord intervals
    const count = Math.min(ratios.length, 1 + n);
    for (let i = 0; i < count; i++) {
      const freq = base * ratios[i];
      const vol = 0.45 + Math.min(0.25, n * 0.05);
      this.note(freq, t + i * 0.05, 0.18, "triangle", vol);
    }
  }

  /** Rising-pitch chime; pitch climbs with the combo streak (capped). */
  combo(streak: number): void {
    if (!this.canSfx()) return;
    const t = this.now();
    const step = Math.min(Math.max(streak, 1), 8) - 1; // 0..7
    // Pentatonic-ish steps so any streak length stays consonant.
    const freq = 523.25 * Math.pow(2, step / 6); // up from C5, ~semitone-ish
    this.note(freq, t, 0.16, "sine", 0.55);
    this.note(freq * 1.5, t + 0.02, 0.12, "triangle", 0.3);
  }

  /** Celebratory sparkle for a perfect (full-board) clear. */
  perfect(): void {
    if (!this.canSfx()) return;
    const t = this.now();
    // Bright cascading arpeggio that twinkles upward.
    const freqs = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    freqs.forEach((f, i) => {
      this.note(f, t + i * 0.06, 0.22, "triangle", 0.5);
      this.note(f * 2, t + i * 0.06 + 0.01, 0.12, "sine", 0.18);
    });
  }

  /** Soft descending "aww" tone on game over. */
  gameOver(): void {
    if (!this.canSfx()) return;
    const t = this.now();
    // Two-note gentle fall, no sharp edges.
    this.note(392, t, 0.4, "sine", 0.5, 330);
    this.note(330, t + 0.18, 0.5, "sine", 0.45, 247);
  }

  /** Tiny UI click. */
  button(): void {
    if (!this.canSfx()) return;
    const t = this.now();
    this.note(660, t, 0.05, "square", 0.25);
  }

  // ---- Background music ----------------------------------------------------

  /**
   * Start a gentle, low-volume looping arpeggio over a couple of chords.
   * Uses a lookahead scheduler driven by setInterval. Respects Settings.music.
   */
  startMusic(): void {
    if (!Settings.music) return;
    this.init();
    if (!this.ctx || !this.master) return;
    if (this.musicTimer !== null) return; // already playing

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = SoundSystem.MUSIC_LEVEL;
    this.musicGain.connect(this.master);

    this.musicStep = 0;
    this.musicNextTime = this.ctx.currentTime + 0.1;
    // Lookahead scheduler: wake periodically and queue any notes due soon.
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 60);
  }

  /** Stop the background music loop and tear down its graph. */
  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain && this.ctx) {
      // Fade out quickly to avoid a click, then disconnect.
      const g = this.musicGain;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.15);
      window.setTimeout(() => g.disconnect(), 250);
      this.musicGain = null;
    }
  }

  // ---- Settings application ------------------------------------------------

  /** Apply a music on/off change immediately. */
  setMusicEnabled(on: boolean): void {
    if (on) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }

  /**
   * Apply an sfx on/off change immediately. SFX are gated per-call via
   * canSfx(), so nothing persistent needs muting here — but stop the music
   * bed nothing; this is intentionally a light hook for symmetry/future use.
   */
  setSfxEnabled(on: boolean): void {
    // No persistent SFX graph exists (each effect is one-shot), so gating in
    // canSfx() is sufficient. Touch the param to keep strict no-unused happy.
    void on;
  }

  // ---- Internals -----------------------------------------------------------

  /** Whether SFX may play right now. */
  private canSfx(): boolean {
    if (this.unavailable || !Settings.sfx) return false;
    this.init();
    return this.ctx !== null && this.master !== null;
  }

  /** Current context time (assumes a context exists — callers guard first). */
  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /**
   * Play a single enveloped note. Quick attack + exponential-ish decay keeps
   * things click-free; the oscillator is stopped and disconnected when done.
   *
   * @param freq    starting frequency in Hz
   * @param start   context time to begin
   * @param dur     total duration in seconds
   * @param wave    oscillator waveform
   * @param peak    relative gain peak (0..1) before master scaling
   * @param glideTo optional frequency to glide to over the note (for blips)
   */
  private note(
    freq: number,
    start: number,
    dur: number,
    wave: Wave,
    peak: number,
    glideTo?: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), start + dur);
    }

    // Envelope: ~8ms attack, smooth decay to (near) zero.
    const attack = 0.008;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain);
    gain.connect(this.master);

    osc.start(start);
    osc.stop(start + dur + 0.02);
    // Clean up the graph once the note has finished.
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** A single music note (uses the music sub-mix, not master directly). */
  private musicNote(freq: number, start: number, dur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);

    // Soft, slow swell so the bed feels ambient rather than plucky.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.6, start + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(start);
    osc.stop(start + dur + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /**
   * Lookahead scheduler: queue any music notes whose start time falls within
   * the next ~0.2s. A slow arpeggio cycles over two gentle chords.
   */
  private scheduleMusic(): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const lookahead = 0.2; // seconds
    const noteDur = 0.55; // overlapping, ambient
    const interval = 0.28; // time between arpeggio steps

    // Two chords (Cmaj7-ish -> Amin7-ish), arpeggiated upward.
    const chordA = [261.63, 329.63, 392.0, 493.88]; // C E G B
    const chordB = [220.0, 261.63, 329.63, 392.0]; // A C E G
    const pattern = [...chordA, ...chordB];

    while (this.musicNextTime < ctx.currentTime + lookahead) {
      const freq = pattern[this.musicStep % pattern.length];
      this.musicNote(freq, this.musicNextTime, noteDur);
      this.musicStep = (this.musicStep + 1) % pattern.length;
      this.musicNextTime += interval;
    }
  }
}

/** Singleton sound system. Named `Sound` to avoid the DOM `Audio` global. */
export const Sound = new SoundSystem();
