import { useRef, useState } from "react";
import * as Tone from "tone";

interface Controls {
  cutoff: number;
  resonance: number;
  drive: number;
  oscillatorMix: number;
  vibrato: number;
}

export function useAudioEngine(initialControls: Partial<Controls> = {}) {
  const [isAudioRunning, setIsAudioRunning] = useState(false);
  const synthInitialized = useRef(false);
  const controls = useRef<Controls>({
    cutoff: 20 * Math.pow(1.0366329, 128),
    resonance: 0,
    drive: 0,
    oscillatorMix: 1,
    vibrato: 0,
  });
  const leftSynth = useRef<Tone.PolySynth | null>(null);
  const rightSynth = useRef<Tone.PolySynth | null>(null);

  const getOscillatorType = (oscillatorMix: number, detune: number = 0): any => {
    if (oscillatorMix < 64) {
      return {
        type: "fatsine",
        count: 4,
        spread: oscillatorMix + 1,
        detune,
      };
    } else {
      return {
        type: "fatsawtooth",
        count: 4,
        spread: oscillatorMix - 60,
        detune,
      };
    }
  };

  const createCharacterWaveshaper = () => {
    return new Tone.WaveShaper((val) => Math.tanh(val), 1024);
  };

  const disposeSynth = () => {
    if (!synthInitialized.current) return;

    if (leftSynth.current) {
      leftSynth.current.disconnect();
      leftSynth.current.dispose();
      leftSynth.current = null;
    }
    if (rightSynth.current) {
      rightSynth.current.disconnect();
      rightSynth.current.dispose();
      rightSynth.current = null;
    }

    synthInitialized.current = false;
    console.log("Synths disposed.");
  };

  const initSynth = () => {
    if (synthInitialized.current) return true;

    try {
      disposeSynth();

      const leftCompressor = new Tone.Compressor({
        ratio: 4,
        attack: 0.3,
        release: 0.05,
        threshold: -24,
        knee: 10,
      });
      const rightCompressor = new Tone.Compressor({
        ratio: 4,
        attack: 0.3,
        release: 0.05,
        threshold: -24,
        knee: 10,
      });

      const leftVolume = new Tone.Volume(-21);
      const rightVolume = new Tone.Volume(-21);

      // Left channel effects
      const leftVibrato = new Tone.Vibrato({ frequency: 0.66, depth: 0, type: "sine" });
      const leftPregain = new Tone.Gain(controls.current.drive);
      const leftCharacter = createCharacterWaveshaper();
      const leftCrossFade = new Tone.CrossFade(controls.current.drive/127);
      const leftAnalyzer = new Tone.Analyser('waveform', 1024);
      const leftPanner = new Tone.Panner(-1);

      // Right channel effects
      const rightVibrato = new Tone.Vibrato({ frequency: 0.66, depth: 0, type: "sine" });
      const rightPregain = new Tone.Gain(controls.current.drive);
      const rightCharacter = createCharacterWaveshaper();
      const rightCrossFade = new Tone.CrossFade(controls.current.drive/127);
      const rightAnalyzer = new Tone.Analyser('waveform', 1024);
      const rightPanner = new Tone.Panner(1);

      const rightSynthDef: Tone.PolySynthOptions<Tone.MonoSynth> = {
          oscillator: getOscillatorType(controls.current.oscillatorMix),
          envelope: {
            attack: 1,
            decay: 0.2,
            sustain: 0.8,
            release: 5.5,
          },
          filterEnvelope: {
            attack: controls.current.cutoff / 64,
            decay: 0.2,
            baseFrequency: 20 * Math.pow(1.0366329, controls.current.cutoff),
            sustain: 1,
            release: 7.5 + controls.current.cutoff / 64,
          },
          filter: {
            type: "lowpass",
            frequency: 0,
            rolloff: -12,
            Q: controls.current.resonance / 3.5,
          },
          debug: true
      };

      // Create left synth with -1 cent detune
      const leftSynthDef = {
        ...rightSynthDef, 
        oscillator: getOscillatorType(controls.current.oscillatorMix, -4)
        
      };

      leftSynth.current = new Tone.PolySynth(Tone.MonoSynth, leftSynthDef);
      rightSynth.current = new Tone.PolySynth(Tone.MonoSynth, rightSynthDef);

      // Left signal chain
      leftSynth.current.connect(leftVibrato);
      leftVibrato.connect(leftCrossFade.a);
      leftVibrato.connect(leftPregain);
      leftPregain.connect(leftCharacter);
      leftCharacter.connect(leftCrossFade.b);
      leftCrossFade.connect(leftAnalyzer);
      leftCrossFade.chain(leftPanner, leftVolume, leftCompressor);

      // Right signal chain
      rightSynth.current.connect(rightVibrato);
      rightVibrato.connect(rightCrossFade.a);
      rightVibrato.connect(rightPregain);
      rightPregain.connect(rightCharacter);
      rightCharacter.connect(rightCrossFade.b);
      rightCrossFade.connect(rightAnalyzer);
      rightCrossFade.chain(rightPanner, rightVolume, rightCompressor);

      leftCompressor.toDestination();
      rightCompressor.toDestination();

      // Store references for parameter updates
      (leftSynth.current as any)._vibrato = leftVibrato;
      (leftSynth.current as any)._pregain = leftPregain;
      (leftSynth.current as any)._crossFade = leftCrossFade;

      (rightSynth.current as any)._vibrato = rightVibrato;
      (rightSynth.current as any)._pregain = rightPregain;
      (rightSynth.current as any)._crossFade = rightCrossFade;

      synthInitialized.current = true;
      console.log("Synth initialized successfully");
      return true;
    } catch (error) {
      console.error("Error initializing synth:", error);
      return false;
    }
  };

  const convertMidiToSynthParams = (controls: Controls) => {
    return {
      cutoff: 20 * Math.pow(1.0366329, controls.cutoff),
      resonance: controls.resonance / 3.5,
      drive: controls.drive * 0.09,
      driveMix: controls.drive / 127,
      oscillatorMix: controls.oscillatorMix,
      vibratoDepth: controls.vibrato / 127,
    };
  };

  const updateSynthParams = () => {
    if (!synthInitialized.current || !leftSynth.current || !rightSynth.current)
      return;

    try {
      const params = convertMidiToSynthParams(controls.current);

      // Update left synth
      leftSynth.current.set({
        filter: { Q: params.resonance },
        filterEnvelope: {
          baseFrequency: params.cutoff,
          release: 7.5 + controls.current.cutoff / 64,
        },
        oscillator: getOscillatorType(params.oscillatorMix, -4), // binaural beats
      });

      // Update right synth
      rightSynth.current.set({
        filter: { Q: params.resonance },
        filterEnvelope: {
          baseFrequency: params.cutoff,
          release: 7.5 + controls.current.cutoff / 64,
        },
        oscillator: getOscillatorType(params.oscillatorMix, 0), // No detune
      });

      // Update shared effects
      for (let polySynth of [leftSynth.current, rightSynth.current]) {
        const vibrato = (polySynth as any)._vibrato as Tone.Vibrato;
        const pregain = (polySynth as any)._pregain as Tone.Gain;
        const crossFade = (polySynth as any)._crossFade as Tone.CrossFade;

        if (vibrato) vibrato.depth.value = params.vibratoDepth;
        if (pregain) pregain.gain.value = params.drive;
        if (crossFade) crossFade.fade.value = params.driveMix;
      }
    } catch (error) {
      console.error("Error updating synth parameters:", error);
    }
  };

  const startAudio = async () => {
    try {
      if (Tone.getContext().state === "running") {
        if (!synthInitialized.current) {
          const success = initSynth();
          if (!success) {
            return false;
          }
        }
        setIsAudioRunning(true);
        return true;
      }

      await Tone.start();
      console.log("Audio context started:", Tone.getContext().state);

      if (Tone.getContext().state === "running") {
        const success = initSynth();
        if (!success) {
          return false;
        }
        setIsAudioRunning(true);
        return true;
      } else {
        return false;
      }
    } catch (error: any) {
      console.error("Error starting audio:", error);
      return false;
    }
  };

  const triggerNote = (noteName: string, velocity: number) => {
    if (!synthInitialized.current) return;
    
    for (let polySynth of [leftSynth.current, rightSynth.current]) {
      polySynth?.triggerAttack(noteName, Tone.now(), velocity / 127);
    }
  };

  const releaseNote = (noteName: string) => {
    if (!synthInitialized.current) return;
    
    for (let polySynth of [leftSynth.current, rightSynth.current]) {
      polySynth?.triggerRelease(noteName, Tone.now());
    }
  };

  const updateControls = (newControls: Partial<Controls>) => {
    controls.current = { ...controls.current, ...newControls };
    updateSynthParams();
  };

  return {
    startAudio,
    triggerNote,
    releaseNote,
    updateControls,
    isAudioRunning,
    convertMidiToSynthParams,
    controlValues: controls.current, // Add this line
  };
}