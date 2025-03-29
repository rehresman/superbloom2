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
    const masterVolume = new Tone.Volume(-21).toDestination();
    
    const masterCompressor = new Tone.Compressor({
      ratio: 4,
      threshold: -15,
      attack: 0.05,
      release: 0.05
    }).connect(masterVolume);
    
    
    // Create a custom MonoSynth that mimics your SuperCollider synth
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
    for( let polySynth of [leftSynth, rightSynth]) {
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
      polySynth._vibrato.depth.value = controls.vibrato / 10;
      
      // Update distortion based on drive control
      if (controls.drive > 1) {
        polySynth._distortion.wet.value = (controls.drive - 1) / 4;
        polySynth._distortion.distortion = Math.min(0.9, (controls.drive - 1) / 4);
      } else {
        polySynth._distortion.wet.value = 0;
      }
      
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







// Create a custom Tone.js effect for soft clipping using hyperbolic tangent (tanh)
class SoftClipper extends Tone.ToneAudioNode {
  constructor(options) {
    super();
    // Default options
    options = Object.assign({
      drive: 1,
      wet: 1
    }, options);

    // Create the waveshaper with our tanh transfer function
    this._shaper = new Tone.WaveShaper({
      curve: this._generateTanhCurve(options.drive),
      oversample: "4x" // Reduce aliasing
    });

    // Create a wet/dry control
    this._wet = new Tone.CrossFade(options.wet);

    // Connect input → crossfade input 1
    this.input.connect(this._wet.a);
    // Connect input → waveshaper → crossfade input 2
    this.input.connect(this._shaper);
    this._shaper.connect(this._wet.b);
    // Connect crossfade output → output
    this._wet.connect(this.output);

    // Set up parameters that can be controlled
    this.drive = options.drive;
    this.wet = options.wet;
  }

  // Generate the tanh curve based on drive amount
  _generateTanhCurve(drive) {
    const samples = 2048;
    const curve = new Float32Array(samples);
    
    // Scaling factor - higher values mean more distortion
    const scaleFactor = drive * 3; // You can adjust this multiplier to taste
    
    for (let i = 0; i < samples; i++) {
      // Convert range from 0 to 2048 into -1 to 1
      const x = (i / (samples - 1)) * 2 - 1;
      
      // Apply tanh function
      // tanh naturally maps to the -1 to 1 range, so no additional normalization is needed
      curve[i] = Math.tanh(x * scaleFactor);
    }
    
    return curve;
  }

  // Getters and setters for parameters
  get drive() {
    return this._drive;
  }

  set drive(value) {
    this._drive = value;
    // Update the waveshaper curve when drive changes
    this._shaper.curve = this._generateTanhCurve(value);
  }

  get wet() {
    return this._wet.fade.value;
  }

  set wet(value) {
    this._wet.fade.value = value;
  }

  // Method to dispose of all created nodes
  dispose() {
    super.dispose();
    this._shaper.dispose();
    this._wet.dispose();
    return this;
  }
}

// Example usage:
function createSoftClipperExample() {
  // Create an oscillator as an input source
  const osc = new Tone.Oscillator({
    frequency: 220,
    type: "sawtooth"
  }).start();

  // Create our soft clipper effect
  const softClipper = new SoftClipper({
    drive: 3, // Adjust the drive amount
    wet: 1    // Fully wet signal
  });

  // Connect the oscillator to the clipper and then to the master output
  osc.connect(softClipper);
  softClipper.connect(Tone.getDestination());

  // Optional: Create a UI to control the drive parameter
  const driveSlider = document.createElement("input");
  driveSlider.type = "range";
  driveSlider.min = "0.1";
  driveSlider.max = "10";
  driveSlider.step = "0.1";
  driveSlider.value = "3";
  driveSlider.addEventListener("input", (e) => {
    softClipper.drive = parseFloat(e.target.value);
  });
  document.body.appendChild(driveSlider);

  // Return the objects for further manipulation
  return { osc, softClipper };
}

// To use this in a web page: 
// 1. Include Tone.js in your project
// 2. Define the SoftClipper class as above
// 3. Call createSoftClipperExample() when ready to create audio

 // Call this to see the example in action