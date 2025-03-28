// Client-side implementation with Tone.js

// Initialize Socket.io for real-time communication
const socket = io();

// Configuration and state management
const activeNotes = new Map(); // Store active note info
let isConnected = false;

// Control parameters
const controls = {
  cutoff: 12000,
  resonance: 1,
  drive: 1,
  oscillatorMix: 0,
  vibrato: 0
};

// Initialize Tone.js synth
let synthInitialized = false;
let leftSynth, rightSynth; // Synth instances for stereo output

// Create a properly initialized synth
function initSynth() {
  if (synthInitialized) return true;
  
  try {
    // Create Master Effects Chain
    const masterVolume = new Tone.Volume(-6).toDestination();
    const masterCompressor = new Tone.Compressor({
      ratio: 4,
      threshold: -15,
      attack: 0.05,
      release: 0.05
    }).connect(masterVolume);
    
    // Create a custom MonoSynth that mimics your SuperCollider synth
    const customSynthDef = {
      oscillator: {
        type: "sawtooth0",
        partials: [1],
        partialCount: 1
      },
      envelope: {
        attack: 0.05,
        decay: 0.1,
        sustain: 0.8,
        release: 1
      },
      filterEnvelope: {
        attack: 0.05,
        decay: 0.5,
        sustain: 1,
        release: 1,
        baseFrequency: controls.cutoff,
        octaves: 0
      },
      filter: {
        type: "lowpass",
        frequency: controls.cutoff,
        rolloff: -12,
        Q: controls.resonance
      }
    };
    
    const leftPanner = new Tone.Panner(-1).connect(masterCompressor);
    const rightPanner = new Tone.Panner(1).connect(masterCompressor);
    
    // Create two synths - one for each channel
    leftSynth = new Tone.PolySynth(Tone.MonoSynth, customSynthDef).connect(leftPanner);
    rightSynth = new Tone.PolySynth(Tone.MonoSynth, customSynthDef).connect(rightPanner);
    
    // Add vibrato effect
    const vibrato = new Tone.Vibrato({
      frequency: 5,
      depth: 0,
      type: "sine"
    }).connect(masterCompressor);
    
    // Add distortion for drive parameter
    const distortion = new Tone.Distortion({
      distortion: 0,
      wet: 0
    }).connect(masterCompressor);
    
    // Create a signal chain that allows us to update parameters
    for( let polySynth of [leftSynth, rightSynth]) {
      polySynth.connect(vibrato);
      vibrato.connect(distortion);
      // Store these effects to update them later
      polySynth._vibrato = vibrato;
      polySynth._distortion = distortion;
    }

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
    // Update all voices
    const oscType = "sawtooth".concat(controls.oscillatorMix.toString());
    for( let polySynth of [leftSynth, rightSynth]) {
      polySynth.set({
        filter: {
          frequency: controls.cutoff,
          Q: controls.resonance
        }
      });
      // Update vibrato depth based on vibrato control
      polySynth._vibrato.depth.value = controls.vibrato / 10;
      
      // Update distortion based on drive control
      if (controls.drive > 1) {
        polySynth._distortion.wet.value = (controls.drive - 1) / 4;
        polySynth._distortion.distortion = Math.min(0.9, (controls.drive - 1) / 4);
      } else {
        polySynth._distortion.wet.value = 0;
      }
      
      // Update oscillator type/mix for all active voices
      polySynth.set({
        oscillator: {
          type: oscType
        }
      });
    }
  } catch (error) {
    console.error("Error updating synth parameters:", error);
  }
}
