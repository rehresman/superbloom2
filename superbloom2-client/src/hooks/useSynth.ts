import { useEffect, useRef, useState, useCallback } from "react";
import * as Tone from "tone";
import io from "socket.io-client";

export function useSynth(initialControls = {}) {
  const [isAudioRunning, setIsAudioRunning] = useState(false);
  const [midiDevices, setMidiDevices] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [socket, setSocket] = useState(null); // State to hold the socket instance
  const synthInitialized = useRef(false);
  const activeNotes = useRef(new Map());
  const controls = useRef({
    cutoff: 20 * Math.pow(1.0366329, 128),
    resonance: 0,
    drive: 1,
    oscillatorMix: 0,
    vibrato: 0,
    ...initialControls, // Merge initial controls
  });
  const leftSynth = useRef(null);
  const rightSynth = useRef(null);

  // Function to connect to the WebSocket
  const connectSocket = useCallback(() => {
    if (!socket) {
      const newSocket = io("http://localhost:3000");
      setSocket(newSocket);
      console.log("Socket connected:", newSocket.id);
    }
  }, [socket]);

  // Function to disconnect from the WebSocket
  const disconnectSocket = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      console.log("Socket disconnected");
    }
  }, [socket]);

  // Dispose of the synth
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

  // Initialize the synth
  const initSynth = () => {
    if (synthInitialized.current) return true;

    try {
      disposeSynth();

      const masterCompressor = new Tone.Compressor({
        ratio: 4,
        attack: 0.1,
        release: 0.05,
        threshold: -24,
        knee: 10,
      });

      const masterVolume = new Tone.Volume(100);
      const pregain = new Tone.Gain(controls.current.drive);
      const character = createCharacterWaveshaper();
      const crossFade = new Tone.CrossFade(controls.current.drive);
      const vibrato = new Tone.Vibrato({
        frequency: 0.66,
        depth: 0,
        type: "sine",
      });

      const leftPanner = new Tone.Panner(-1);
      const rightPanner = new Tone.Panner(1);

      const customSynthDef = {
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
      };

      leftSynth.current = new Tone.PolySynth(Tone.MonoSynth, customSynthDef);
      rightSynth.current = new Tone.PolySynth(Tone.MonoSynth, customSynthDef);

      // Correctly chain the nodes
      leftSynth.current.connect(vibrato);
      vibrato.connect(pregain);
      pregain.connect(character);
      character.connect(crossFade.a);
      crossFade.connect(leftPanner);
      leftPanner.connect(masterVolume);
      masterVolume.connect(masterCompressor);

      rightSynth.current.connect(vibrato);
      vibrato.connect(pregain);
      pregain.connect(character);
      character.connect(crossFade.b);
      crossFade.connect(rightPanner);
      rightPanner.connect(masterVolume);

      masterCompressor.toDestination();

      // Assign additional properties to synths for parameter updates
      leftSynth.current._vibrato = vibrato;
      rightSynth.current._vibrato = vibrato;
      leftSynth.current._pregain = pregain;
      rightSynth.current._pregain = pregain;
      leftSynth.current._crossFade = crossFade;
      rightSynth.current._crossFade = crossFade;

      synthInitialized.current = true;
      console.log("Synth initialized successfully");
      return true;
    } catch (error) {
      console.error("Error initializing synth:", error);
      return false;
    }
  };

  // Update synth parameters dynamically
  const updateControls = useCallback((newControls) => {
    controls.current = { ...controls.current, ...newControls };
    updateSynthParams();
  }, []);

  const updateSynthParams = () => {
    if (!synthInitialized.current || !leftSynth.current) return;

    try {
      for (let polySynth of [leftSynth.current, rightSynth.current]) {
        polySynth.set({
          filter: { Q: controls.current.resonance / 3.5 },
          filterEnvelope: {
            baseFrequency: 20 * Math.pow(1.0366329, controls.current.cutoff),
            release: 7.5 + controls.current.cutoff / 64,
          },
        });

        // Ensure vibrato, pregain, and crossFade are updated
        if (polySynth._vibrato) {
          polySynth._vibrato.depth.value = controls.current.vibrato / 127;
        }
        if (polySynth._pregain) {
          polySynth._pregain.gain.value = controls.current.drive * 0.09;
        }
        if (polySynth._crossFade) {
          polySynth._crossFade.fade.value =
            controls.current.drive > 127 ? 0 : controls.current.drive / 127;
        }

        polySynth.set({
          oscillator: getOscillatorType(controls.current.oscillatorMix),
        });
      }
    } catch (error) {
      console.error("Error updating synth parameters:", error);
    }
  };

  // Start the audio context
  const startAudio = async () => {
    try {
      if (Tone.context.state === "running") {
        setStatusMessage("Audio already running");
        if (!synthInitialized.current) {
          const success = initSynth();
          if (!success) {
            setStatusMessage("Failed to initialize synth.");
            return false;
          }
        }
        setIsAudioRunning(true);
        return true;
      }

      setStatusMessage("Starting audio...");
      await Tone.start();
      console.log("Audio context started:", Tone.context.state);

      if (Tone.context.state === "running") {
        const success = initSynth();
        if (!success) {
          setStatusMessage("Failed to initialize synth.");
          return false;
        }
        setStatusMessage("Audio started successfully!");
        setIsAudioRunning(true);
        return true;
      } else {
        setStatusMessage("Audio failed to start. Please try again.");
        return false;
      }
    } catch (error) {
      console.error("Error starting audio:", error);
      setStatusMessage("Error starting audio: " + error.message);
      return false;
    }
  };

  // Handle note on
  const noteOn = (note, velocity, isLocal = true) => {
    const noteName = Tone.Frequency(note, "midi").toNote();
    console.log(`noteOn called: ${noteName}, velocity: ${velocity}`);
    if (Tone.context.state !== "running") {
      startAudio().then((success) => {
        if (success) {
          triggerNote(noteName, note, velocity, isLocal);
        }
      });
    } else {
      triggerNote(noteName, note, velocity, isLocal);
    }
  };

  const triggerNote = (noteName, midiNote, velocity, isLocal) => {
    if (!synthInitialized.current) {
      console.warn("Can't play note - synth not initialized");
      return;
    }

    try {
      activeNotes.current.set(midiNote, { noteName, velocity });
      for (let polySynth of [leftSynth.current, rightSynth.current]) {
        polySynth.triggerAttack(noteName, Tone.now(), velocity / 127);
      }
      console.log(`Triggering note: ${noteName} on synth`);

      if (isLocal && socket) {
        socket.emit("midi", {
          type: "noteon",
          note: midiNote,
          velocity,
        });
      }
    } catch (error) {
      console.error(`Error triggering note ${noteName}:`, error);
    }
  };

  // Handle note off
  const noteOff = (note, isLocal = true) => {
    if (!synthInitialized.current) return;

    try {
      if (activeNotes.current.has(note)) {
        const noteInfo = activeNotes.current.get(note);
        const noteName = noteInfo.noteName;

        console.log(`noteOff called: ${noteName}`);

        // Trigger release for both synths
        for (let polySynth of [leftSynth.current, rightSynth.current]) {
          polySynth.triggerRelease(noteName, Tone.now());
        }

        // Remove the note from activeNotes
        activeNotes.current.delete(note);

        // Emit the note-off event if it's a local note
        if (isLocal && socket) {
          socket.emit("midi", { type: "noteoff", note });
        }
      }
    } catch (error) {
      console.error(`Error releasing note ${note}:`, error);
    }
  };

  // Handle MIDI setup
  const setupMIDI = () => {
    if (navigator.requestMIDIAccess) {
      navigator
        .requestMIDIAccess()
        .then(onMIDISuccess, onMIDIFailure)
        .catch((err) => {
          console.error("MIDI Access Error:", err);
          setStatusMessage("MIDI access error: " + err.message);
        });
    } else {
      console.warn("WebMIDI is not supported in this browser.");
      setStatusMessage("MIDI not supported in this browser");
    }
  };

  const onMIDISuccess = (midiAccess) => {
    const inputs = midiAccess.inputs.values();
    const devices = [];
    for (let input of inputs) {
      input.onmidimessage = handleMIDIMessage;
      devices.push(input.name);
    }
    setMidiDevices(devices);
    setStatusMessage(`Connected to ${devices.length} MIDI device(s)`);
  };

  const onMIDIFailure = (error) => {
    console.error("Could not access your MIDI devices:", error);
    setStatusMessage("Failed to access MIDI devices");
  };

  const handleMIDIMessage = (event) => {
    const [status, data1, data2] = event.data;
    const command = status & 0xf0;

    switch (command) {
      case 0x90:
        if (data2 > 0) {
          noteOn(data1, data2);
        } else {
          noteOff(data1);
        }
        break;
      case 0x80:
        noteOff(data1);
        break;
      case 0xb0:
        controlChange(data1, data2);
        break;
    }
  };

  const controlChange = (cc, value, isLocal = true) => {
    try {
      switch (cc) {
        case 1:
          controls.current.vibrato = value;
          break;
        case 71:
          controls.current.resonance = value;
          break;
        case 74:
          controls.current.cutoff = value;
          break;
        case 76:
          controls.current.drive = value;
          break;
        case 77:
          controls.current.oscillatorMix = value;
          break;
      }
      updateSynthParams();

      if (isLocal && socket) {
        socket.emit("midi", { type: "cc", cc, value });
      }
    } catch (error) {
      console.error(
        `Error processing control change CC=${cc}, value=${value}:`,
        error
      );
    }
  };

  const getOscillatorType = (oscillatorMix) => {
    if (oscillatorMix < 64) {
      return {
        type: "sawtooth",
        count: Math.floor(oscillatorMix / 16),
        spread: oscillatorMix,
      };
    } else {
      return {
        type: "fatsawtooth",
        count: 4,
        spread: oscillatorMix - 60,
      };
    }
  };

  const createCharacterWaveshaper = () => {
    return new Tone.WaveShaper((val) => Math.tanh(val), 1024);
  };

  useEffect(() => {
    setupMIDI();

    return () => {
      disposeSynth();
    };
  }, []);

  return {
    startAudio,
    noteOn,
    noteOff,
    updateControls,
    connectSocket, // Expose the connectSocket function
    disconnectSocket, // Expose the disconnectSocket function
    socket, // Expose the socket state
    statusMessage,
    midiDevices,
  };
}
