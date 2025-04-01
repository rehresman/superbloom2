// Client-side implementation with Tone.js

// Initialize Socket.io for real-time communication
const socket = io();

// Configuration and state management
const activeNotes = new Map(); // Store active note info
let isConnected = false;

// Control parameters
const controls = {
  cutoff: 20*Math.pow(1.0366329, 128),
  resonance: 0,
  drive: 0,
  oscillatorMix: 0,
  vibrato: 0
};

// Initialize Tone.js synth
let synthInitialized = false;
let leftSynth, rightSynth; // Synth instances for stereo output
let leftAnalyzer, rightAnalyzer;

// Create a properly initialized synth
function initSynth() {
  if (synthInitialized) return true;
  
  try {
    disposeSynth(); // Disconnect any previous synth connections

    // create master compressor for extreme resonance
    const masterCompressor = new Tone.Compressor({
      ratio: 4,
      attack: 0.1,
      release: 0.05,
      threshold: -24,
      knee: 10
    }).toDestination();

    // Create Master Effects Chain
    const masterVolume = new Tone.Volume(-21);

    // pregain for character
    const pregain = new Tone.Gain(controls.drive);
    
    // character waveshaper
    const character = createCharacterWaveshaper();

    // wet/dry mix of character
    const crossFade = new Tone.CrossFade(controls.drive);

    // Add vibrato effect
      const vibrato = new Tone.Vibrato({
        frequency: 0.66,
        depth: 0,
        type: "sine"
      });

    // panners for stereo output
    const leftPanner = new Tone.Panner(-1);
    const rightPanner = new Tone.Panner(1);

    // create analyzers for left and right channels
    leftAnalyzer = new Tone.Analyser('waveform', 1024);
    rightAnalyzer = new Tone.Analyser('waveform', 1024);
    
    // synth definition
    const customSynthDef = {
      oscillator: getOscillatorType(controls.oscillatorMix),
      envelope: {
        attack: 1,
        decay: 0.2,
        sustain: 0.8,
        release: 5.5
      },
      filterEnvelope: {
        attack: controls.cutoff / 64,
        decay: 0.2,
        baseFrequency: 20*Math.pow(1.0366329, controls.cutoff),
        sustain: 1,
        release: 7.5 + controls.cutoff / 64
      },
      filter: {
        type: "lowpass",
        frequency: 0,
        rolloff: -12,
        Q: controls.resonance / 3.5
      }
    };
    
    
    // Create two synths - one for each channel
    leftSynth = new Tone.PolySynth(Tone.MonoSynth, customSynthDef);
    rightSynth = new Tone.PolySynth(Tone.MonoSynth, customSynthDef); 

    // connect synth chains
    //leftSynth.chain(vibrato, pregain, character, leftAnalyzer, leftPanner, masterVolume);
    //rightSynth.chain(vibrato, pregain, character, rightAnalyzer, rightPanner, masterVolume);


    leftSynth.connect(vibrato);
    vibrato.connect(crossFade.a);
    vibrato.connect(pregain);
    pregain.connect(character);
    character.connect(crossFade.b);
    crossFade.connect(leftAnalyzer);
    vibrato.chain(leftAnalyzer, leftPanner, masterVolume, masterCompressor);

    rightSynth.connect(vibrato);
    vibrato.connect(crossFade.a);
    vibrato.connect(pregain);
    pregain.connect(character);
    character.connect(crossFade.b);
    crossFade.connect(rightAnalyzer);
    vibrato.chain(rightAnalyzer, rightPanner, masterVolume, masterCompressor);

    leftSynth._pregain = pregain;
    rightSynth._pregain = pregain;

    leftSynth._crossFade = crossFade;
    rightSynth._crossFade = crossFade;

    leftSynth._vibrato = vibrato;
    rightSynth._vibrato = vibrato;


    synthInitialized = true;
    console.log("Synth initialized successfully");
    updateUIStatus("Synth ready! You can play now.");

    return true;
  } catch (error) {
    console.error("Error initializing synth:", error);
    updateUIStatus("Failed to initialize synth: " + error.message, true);
    return false;
  }
}

// Updates synth parameters based on control values
function updateSynthParams() {
  if (!synthInitialized || !leftSynth) return;
  
  try {
    for( let polySynth of [leftSynth, rightSynth]) {
      // update filter
      polySynth.set({
        filter: {
          Q: controls.resonance / 3.5
        },
        filterEnvelope: {
          baseFrequency: 20*Math.pow(1.0366329, controls.cutoff),
          release: 7.5 + controls.cutoff / 64
        }
      });

      // Update vibrato depth based on vibrato control
      polySynth._vibrato.depth.value = controls.vibrato / 127;
      
      // update drive and character wet/dry
      polySynth._pregain.gain.value = controls.drive * .09;
      polySynth._crossFade.fade.value = controls.drive > 127 ? 0 : controls.drive /127;
      console.log(polySynth._crossFade.fade.value);
      
      // Update oscillator type/mix for all active voices
      polySynth.set({oscillator: getOscillatorType(controls.oscillatorMix)});
    }
  } catch (error) {
    console.error("Error updating synth parameters:", error);
  }
}

function getOscillatorType(oscillatorMix) {
  if (oscillatorMix < 64) {
    const oscType = "sawtooth".concat(oscillatorMix.toString());
    return {
        type: oscType,
        count: Math.floor(oscillatorMix / 16),
        spread: oscillatorMix
      };
  } else {
    return {
        type: "fatsawtooth",
        count: 4,
        spread: oscillatorMix - 60
      };
  }
}

function createCharacterWaveshaper() {
  const waveshaper = new Tone.WaveShaper((val) => Math.tanh(val), 1024);
  return waveshaper;
}

function disposeSynth() {
  if (leftSynth) {
    leftSynth.disconnect();
    leftSynth.dispose();
    leftSynth = null;
  }
  if (rightSynth) {
    rightSynth.disconnect();
    rightSynth.dispose();
    rightSynth = null;
  }
  
  // Add cleanup for analyzers
  if (leftAnalyzer) {
    leftAnalyzer.dispose();
    leftAnalyzer = null;
  }
  if (rightAnalyzer) {
    rightAnalyzer.dispose();
    rightAnalyzer = null;
  }
  
  synthInitialized = false;
  console.log("Synths disposed.");
}

// Log analyzer values when needed
function checkAnalyzer() {
  const waveform = leftAnalyzer.getValue();
  console.log("Analyzer data:", waveform);
  
  // Check if there's actual signal (non-zero values)
  const hasSignal = waveform.some(value => value !== 0);
  console.log("Signal detected:", hasSignal);
  
  // Optionally, you could look at signal levels
  const maxLevel = Math.max(...waveform.map(Math.abs));
  console.log("Max signal level:", maxLevel);
}

// Call this function when needed, like during note triggering
// or set an interval to check regularly