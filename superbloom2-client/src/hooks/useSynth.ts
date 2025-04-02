import { useEffect, useRef, useState, useCallback } from "react";
import * as Tone from "tone";
import io, { Socket } from "socket.io-client";

interface Controls {
  cutoff: number;
  resonance: number;
  drive: number;
  oscillatorMix: number;
  vibrato: number;
}

export function useSynth(initialControls: Partial<Controls> = {}) {
  const [isAudioRunning, setIsAudioRunning] = useState(false);
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [socket, setSocket] = useState<Socket | null>(null); // State to hold the socket instance
  const synthInitialized = useRef(false);
  const activeNotes = useRef<
    Map<number, { noteName: string; velocity: number }>
  >(new Map());
  const controls = useRef<Controls>({
    cutoff: 20 * Math.pow(1.0366329, 128),
    resonance: 0,
    drive: 1,
    oscillatorMix: 0,
    vibrato: 0,
    ...initialControls, // Merge initial controls
  });
  const leftSynth = useRef<Tone.PolySynth | null>(null);
  const rightSynth = useRef<Tone.PolySynth | null>(null);

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

      const customSynthDef: Tone.PolySynthOptions = {
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
      leftSynth.current.chain(
        vibrato,
        pregain,
        character,
        crossFade.a,
        leftPanner,
        masterVolume,
        masterCompressor
      );
      rightSynth.current.chain(
        vibrato,
        pregain,
        character,
        crossFade.b,
        rightPanner,
        masterVolume
      );

      masterCompressor.toDestination();

      // Assign additional properties to synths for parameter updates
      (leftSynth.current as any)._vibrato = vibrato;
      (rightSynth.current as any)._vibrato = vibrato;
      (leftSynth.current as any)._pregain = pregain;
      (rightSynth.current as any)._pregain = pregain;
      (leftSynth.current as any)._crossFade = crossFade;
      (rightSynth.current as any)._crossFade = crossFade;

      synthInitialized.current = true;
      console.log("Synth initialized successfully");
      return true;
    } catch (error) {
      console.error("Error initializing synth:", error);
      return false;
    }
  };

  // Update synth parameters dynamically
  const updateControls = useCallback((newControls: Partial<Controls>) => {
    controls.current = { ...controls.current, ...newControls };
    updateSynthParams();
  }, []);

  const updateSynthParams = () => {
    if (!synthInitialized.current || !leftSynth.current || !rightSynth.current)
      return;

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
        const vibrato = (polySynth as any)._vibrato as Tone.Vibrato;
        const pregain = (polySynth as any)._pregain as Tone.Gain;
        const crossFade = (polySynth as any)._crossFade as Tone.CrossFade;

        if (vibrato) {
          vibrato.depth.value = controls.current.vibrato / 127;
        }
        if (pregain) {
          pregain.gain.value = controls.current.drive * 0.09;
        }
        if (crossFade) {
          crossFade.fade.value =
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
  const noteOn = (note: number, velocity: number, isLocal = true) => {
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

  const triggerNote = (
    noteName: string,
    midiNote: number,
    velocity: number,
    isLocal: boolean
  ) => {
    if (!synthInitialized.current) {
      console.warn("Can't play note - synth not initialized");
      return;
    }

    try {
      activeNotes.current.set(midiNote, { noteName, velocity });
      for (let polySynth of [leftSynth.current, rightSynth.current]) {
        polySynth?.triggerAttack(noteName, Tone.now(), velocity / 127);
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
  const noteOff = (note: number, isLocal = true) => {
    if (!synthInitialized.current) return;

    try {
      if (activeNotes.current.has(note)) {
        const noteInfo = activeNotes.current.get(note);
        const noteName = noteInfo?.noteName;

        console.log(`noteOff called: ${noteName}`);

        // Trigger release for both synths
        for (let polySynth of [leftSynth.current, rightSynth.current]) {
          polySynth?.triggerRelease(noteName, Tone.now());
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

  const onMIDISuccess = (midiAccess: WebMidi.MIDIAccess) => {
    const inputs = midiAccess.inputs.values();
    const devices: string[] = [];
    for (let input of inputs) {
      input.onmidimessage = handleMIDIMessage;
      devices.push(input.name);
    }
    setMidiDevices(devices);
    setStatusMessage(`Connected to ${devices.length} MIDI device(s)`);
  };

  const onMIDIFailure = (error: Error) => {
    console.error("Could not access your MIDI devices:", error);
    setStatusMessage("Failed to access MIDI devices");
  };

  const handleMIDIMessage = (event: WebMidi.MIDIMessageEvent) => {
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

  const controlChange = (cc: number, value: number, isLocal = true) => {
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

  const getOscillatorType = (oscillatorMix: number) => {
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
