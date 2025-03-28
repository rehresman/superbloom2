// Function to start audio context with user interaction
async function startAudio() {
    try {
      // Skip if already started
      if (Tone.context.state === "running") {
        updateUIStatus("Audio already running");
        initSynth();
        return true;
      }
      
      updateUIStatus("Starting audio...");
      await Tone.start();
      console.log("Audio context started:", Tone.context.state);
      
      if (Tone.context.state === "running") {
        updateUIStatus("Audio started successfully!");
        return initSynth();
      } else {
        updateUIStatus("Audio failed to start. Please try again.", true);
        return false;
      }
    } catch (error) {
      console.error("Error starting audio:", error);
      updateUIStatus("Error starting audio: " + error.message, true);
      return false;
    }
  }


// Handle note on event (with velocity)
function noteOn(note, velocity, isLocal = true) {
    // Convert MIDI note number to note name
    const noteName = Tone.Frequency(note, "midi").toNote();
    
    // Start audio if needed
    if (Tone.context.state !== "running") {
      startAudio().then(success => {
        if (success) {
          triggerNote(noteName, note, velocity, isLocal);
        }
      });
    } else {
      triggerNote(noteName, note, velocity, isLocal);
    }
  }
  
  // Actually trigger the note after ensuring audio is running
  function triggerNote(noteName, midiNote, velocity, isLocal) {
    if (!synthInitialized) {
      console.warn("Can't play note - synth not initialized");
      return;
    }
    
    try {
      // Store note information
      activeNotes.set(midiNote, {
        noteName: noteName,
        velocity: velocity
      });
      
      // Trigger note with adjusted velocity (0-1 range)
      for( let polySynth of [leftSynth, rightSynth]) {
        polySynth.triggerAttack(noteName, Tone.now(), velocity / 127);
      }
      
      // If this is a local note, send it to the other client
      if (isLocal && isConnected) {
        socket.emit('midi', {
          type: 'noteon',
          note: midiNote,
          velocity: velocity
        });
      }
    } catch (error) {
      console.error(`Error triggering note ${noteName}:`, error);
    }
  }
  
  // Handle note off event
  function noteOff(note, isLocal = true) {
    if (!synthInitialized) return;
    
    try {
      // Get note name from stored information
      if (activeNotes.has(note)) {
        const noteInfo = activeNotes.get(note);
        const noteName = noteInfo.noteName;
        
        // Trigger release
        for( let polySynth of [leftSynth, rightSynth]) {
          polySynth.triggerRelease(noteName, Tone.now());
        }
        activeNotes.delete(note);
        
        // If this is a local note, send it to the other client
        if (isLocal && isConnected) {
          socket.emit('midi', {
            type: 'noteoff',
            note: note
          });
        }
      }
    } catch (error) {
      console.error(`Error releasing note ${note}:`, error);
    }
  }
  
  // Handle MIDI control change messages
  function controlChange(cc, value, isLocal = true) {
    try {
      // Process the control change based on CC number
      switch (cc) {
        case 1: // Modulation wheel - controls vibrato
          controls.vibrato = value;
          break;
        case 71: // Resonance
          controls.resonance = value;
          break;
        case 74: // Cutoff
          controls.cutoff = value; 
          break;
        case 76: // Drive
          controls.drive = value; 
          break;
        case 77: // Oscillator Mix
          controls.oscillatorMix = value ;
          break;
      }
      
      // Update synth parameters
      updateSynthParams();
      
      // If this is a local control change, send it to the other client
      if (isLocal && isConnected) {
        socket.emit('midi', {
          type: 'cc',
          cc: cc,
          value: value
        });
      }
    } catch (error) {
      console.error(`Error processing control change CC=${cc}, value=${value}:`, error);
    }
  }
  
  // Update UI status message
  function updateUIStatus(message, isError = false) {
    const audioStatus = document.getElementById('audioStatus');
    if (audioStatus) {
      audioStatus.textContent = message;
      audioStatus.style.color = isError ? '#e74c3c' : '#2ecc71';
    }
  }
  
  // Setup WebMIDI API to receive MIDI from connected devices
  function setupMIDI() {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess()
        .then(onMIDISuccess, onMIDIFailure)
        .catch(err => {
          console.error('MIDI Access Error:', err);
          updateUIStatus("MIDI access error: " + err.message, true);
        });
    } else {
      console.warn('WebMIDI is not supported in this browser. Try using Chrome or Edge.');
      updateUIStatus("MIDI not supported in this browser", true);
    }
  }
  
  function onMIDISuccess(midiAccess) {
    // Get all MIDI input devices
    const inputs = midiAccess.inputs.values();
    
    // Attach MIDI message handlers to all input devices
    let deviceCount = 0;
    for (let input of inputs) {
      input.onmidimessage = handleMIDIMessage;
      console.log(`MIDI input: ${input.name} connected`);
      deviceCount++;
    }
    
    if (deviceCount > 0) {
      updateUIStatus(`Connected to ${deviceCount} MIDI device(s)`);
    } else {
      updateUIStatus("No MIDI devices found. Connect a MIDI controller and refresh.");
    }
  }
  
  function onMIDIFailure(error) {
    console.error('Could not access your MIDI devices:', error);
    updateUIStatus("Failed to access MIDI devices", true);
  }
  
  function handleMIDIMessage(event) {
    const [status, data1, data2] = event.data;
    
    // Extract the MIDI command and channel
    const command = status & 0xF0;
    
    // Route MIDI messages to the appropriate handlers
    switch (command) {
      case 0x90: // Note on
        if (data2 > 0) {
          // Note-on with velocity=0 is actually a note-off
          noteOn(data1, data2);
        } else {
          noteOff(data1);
        }
        break;
        
      case 0x80: // Note off
        noteOff(data1);
        break;
        
      case 0xB0: // Control change
        controlChange(data1, data2);
        break;
    }
  }
  
  // Socket.io event handling for remote MIDI messages
  socket.on('connect', () => {
    isConnected = true;
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
      connectionStatus.textContent = 'Connected';
      connectionStatus.className = 'connected';
    }
  });
  
  socket.on('disconnect', () => {
    isConnected = false;
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
      connectionStatus.textContent = 'Disconnected';
      connectionStatus.className = 'disconnected';
    }
  });
  
  socket.on('midi', (msg) => {
    // Process incoming MIDI messages from the other client
    switch (msg.type) {
      case 'noteon':
        noteOn(msg.note, msg.velocity, false);
        break;
      case 'noteoff':
        noteOff(msg.note, false);
        break;
      case 'cc':
        controlChange(msg.cc, msg.value, false);
        break;
    }
  });
  
  // Document ready function
  document.addEventListener('DOMContentLoaded', () => {
    // Add start audio button handler
    const startAudioBtn = document.getElementById('startAudioBtn');
    if (startAudioBtn) {
      startAudioBtn.addEventListener('click', async () => {
        startAudioBtn.disabled = true;
        startAudioBtn.textContent = "Starting...";
        
        const success = await startAudio();
        
        if (success) {
          startAudioBtn.style.display = 'none';
          setupMIDI();
        } else {
          startAudioBtn.textContent = "Try Again";
          startAudioBtn.disabled = false;
        }
      });
    }
    
    // Room connection handling
    const roomInput = document.getElementById('roomId');
    const joinButton = document.getElementById('joinRoom');
    const leaveButton = document.getElementById('leaveRoom');
    const participantCount = document.getElementById('participantCount');
    const connectionStatus = document.getElementById('connectionStatus');
    
    if (joinButton) {
      joinButton.addEventListener('click', () => {
        const roomId = roomInput.value.trim();
        if (roomId) {
          socket.emit('joinRoom', roomId);
        }
      });
    }
    
    if (leaveButton) {
      leaveButton.addEventListener('click', () => {
        socket.emit('leaveRoom');
        if (connectionStatus) {
          connectionStatus.textContent = 'Disconnected from room';
          connectionStatus.className = 'disconnected';
        }
        if (participantCount) {
          participantCount.textContent = '';
        }
      });
    }
    
    // Socket events for room management
    socket.on('roomJoined', (roomId) => {
      if (connectionStatus) {
        connectionStatus.textContent = `Connected to room: ${roomId}`;
        connectionStatus.className = 'connected';
      }
    });
    
    socket.on('roomFull', () => {
      alert('Room is full (maximum 2 players per room)');
      if (connectionStatus) {
        connectionStatus.textContent = 'Room full - try another room';
        connectionStatus.className = 'disconnected';
      }
    });
    
    socket.on('roomUpdate', (data) => {
      if (participantCount) {
        participantCount.textContent = ` (${data.participants}/2 players)`;
      }
    });
    
    // Setup virtual keyboard
    const keys = document.querySelectorAll('.key');
    keys.forEach(key => {
      const note = parseInt(key.dataset.note);
      
      key.addEventListener('mousedown', () => {
        // Ensure audio is started
        if (Tone.context.state !== "running") {
          startAudio().then(success => {
            if (success) {
              noteOn(note, 100);
            }
          });
        } else {
          noteOn(note, 100);
        }
        key.classList.add('active');
      });
      
      key.addEventListener('mouseup', () => {
        noteOff(note);
        key.classList.remove('active');
      });
      
      key.addEventListener('mouseleave', () => {
        if (key.classList.contains('active')) {
          noteOff(note);
          key.classList.remove('active');
        }
      });
    });
    
    // Setup control sliders
    const cutoffSlider = document.getElementById('cutoff');
    const resonanceSlider = document.getElementById('resonance');
    const driveSlider = document.getElementById('drive');
    const oscillatorMixSlider = document.getElementById('oscillatorMix');
    const vibratoSlider = document.getElementById('vibrato');
    
    const cutoffValue = document.getElementById('cutoffValue');
    const resonanceValue = document.getElementById('resonanceValue');
    const driveValue = document.getElementById('driveValue');
    const oscillatorMixValue = document.getElementById('oscillatorMixValue');
    const vibratoValue = document.getElementById('vibratoValue');
    
    // Update UI displays when sliders change
    if (cutoffSlider && cutoffValue) {
      cutoffSlider.addEventListener('input', () => {
        // Ensure audio is started
        if (Tone.context.state !== "running") {
          startAudio();
        }
        
        const value = cutoffSlider.value;
        const frequency = Math.pow(10, value * 2.78) + 10;
        cutoffValue.textContent = `${Math.round(frequency)} Hz`;
        controlChange(74, Math.floor(value * 127));
      });
    }
    
    if (resonanceSlider && resonanceValue) {
      resonanceSlider.addEventListener('input', () => {
        if (Tone.context.state !== "running") startAudio();
        
        const value = resonanceSlider.value;
        const resonance = 1 - (value * 0.97);
        resonanceValue.textContent = resonance.toFixed(2);
        controlChange(71, Math.floor(value * 127));
      });
    }
    
    if (driveSlider && driveValue) {
      driveSlider.addEventListener('input', () => {
        if (Tone.context.state !== "running") startAudio();
        
        const value = driveSlider.value;
        const drive = 1 + (value * 4);
        driveValue.textContent = drive.toFixed(2);
        controlChange(76, Math.floor(value * 127));
      });
    }
    
    if (oscillatorMixSlider && oscillatorMixValue) {
      oscillatorMixSlider.addEventListener('input', () => {
        if (Tone.context.state !== "running") startAudio();
        
        const value = oscillatorMixSlider.value;
        oscillatorMixValue.textContent = value.toFixed(2);
        controlChange(77, Math.floor(value * 127));
      });
    }
    
    if (vibratoSlider && vibratoValue) {
      vibratoSlider.addEventListener('input', () => {
        if (Tone.context.state !== "running") startAudio();
        
        const value = vibratoSlider.value;
        vibratoValue.textContent = value.toFixed(2);
        controlChange(1, Math.floor(value * 127));
      });
    }
    
    // Computer keyboard support for virtual piano
    const keyMap = {
      'a': 60, // C3
      'w': 61, // C#3
      's': 62, // D3
      'e': 63, // D#3
      'd': 64, // E3
      'f': 65, // F3
      't': 66, // F#3
      'g': 67, // G3
      'y': 68, // G#3
      'h': 69, // A3
      'u': 70, // A#3
      'j': 71, // B3
      'k': 72, // C4
      'o': 73, // C#4
      'l': 74, // D4
      'p': 75, // D#4
      ';': 76, // E4
      "'": 77, // F4
    };
    
    const pressedKeys = new Set();
    
    document.addEventListener('keydown', (e) => {
      // Special keys to control synth
      if (e.key === ' ' && Tone.context.state !== "running") {
        startAudio();
        return;
      }
      
      const key = e.key.toLowerCase();
      if (keyMap[key] && !pressedKeys.has(key)) {
        pressedKeys.add(key);
        const note = keyMap[key];
        
        // Ensure audio is started
        if (Tone.context.state !== "running") {
          startAudio().then(success => {
            if (success) {
              noteOn(note, 100);
              
              // Highlight the corresponding key on the virtual keyboard
              const keyElement = document.querySelector(`.key[data-note="${note}"]`);
              if (keyElement) {
                keyElement.classList.add('active');
              }
            }
          });
        } else {
          noteOn(note, 100);
          
          // Highlight the corresponding key on the virtual keyboard
          const keyElement = document.querySelector(`.key[data-note="${note}"]`);
          if (keyElement) {
            keyElement.classList.add('active');
          }
        }
      }
    });
    
    document.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (keyMap[key]) {
        pressedKeys.delete(key);
        const note = keyMap[key];
        noteOff(note);
        
        // Remove highlight from the corresponding key
        const keyElement = document.querySelector(`.key[data-note="${note}"]`);
        if (keyElement) {
          keyElement.classList.remove('active');
        }
      }
    });
  });