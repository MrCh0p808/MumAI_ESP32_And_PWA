/**
 * Audio Recording and PCM Resampling Engine for Agora Voiceprint Calibration.
 * Records microphone audio, computes real-time VU levels, and converts
 * to 16,000 Hz, 16-bit Mono Linear PCM (standard Agora SAL input format).
 */

export interface RecordingResult {
  pcmBase64: string;
  wavBlob: Blob;
  wavUrl: string;
  durationSeconds: number;
}

export class VoiceprintRecorder {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private isRecording = false;

  async startRecording(
    durationMs: number = 6000,
    onProgress?: (secondsLeft: number, volumeLevel: number) => void
  ): Promise<RecordingResult> {
    if (this.isRecording) {
      throw new Error("Recording is already in progress");
    }

    this.isRecording = true;
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass();
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    // Audio capture via ScriptProcessor (universally supported across browsers and iframes)
    const bufferSize = 4096;
    const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    const capturedSamples: Float32Array[] = [];

    processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const input = e.inputBuffer.getChannelData(0);
      capturedSamples.push(new Float32Array(input));
    };

    source.connect(processor);
    processor.connect(this.audioContext.destination);

    const startTime = Date.now();
    const pcmDataPromise = new Promise<RecordingResult>((resolve, reject) => {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const intervalId = setInterval(() => {
        if (!this.isRecording) {
          clearInterval(intervalId);
          return;
        }

        const elapsed = Date.now() - startTime;
        const remainingSeconds = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avgVol = Math.min(100, Math.round((sum / dataArray.length) * 1.5));

        if (onProgress) {
          onProgress(remainingSeconds, avgVol);
        }

        if (elapsed >= durationMs) {
          clearInterval(intervalId);
          this.isRecording = false;

          try {
            // Stop media stream tracks and disconnect processor
            processor.disconnect();
            source.disconnect();
            this.mediaStream?.getTracks().forEach(t => t.stop());

            const sampleRate = this.audioContext?.sampleRate || 44100;
            const totalSamples = capturedSamples.reduce((acc, curr) => acc + curr.length, 0);
            const merged = new Float32Array(totalSamples);
            let offset = 0;
            for (const chunk of capturedSamples) {
              merged.set(chunk, offset);
              offset += chunk.length;
            }

            // Resample to 16,000 Hz
            const targetSampleRate = 16000;
            const resampled = this.resampleAudio(merged, sampleRate, targetSampleRate);

            // Convert Float32Array [-1.0, 1.0] to 16-bit signed PCM
            const pcm16 = this.floatTo16BitPCM(resampled);
            const pcmBase64 = this.arrayBufferToBase64(pcm16.buffer);

            // Generate playable WAV blob for immediate audio preview in UI
            const wavBlob = this.createWavBlob(pcm16, targetSampleRate);
            const wavUrl = URL.createObjectURL(wavBlob);

            if (this.audioContext?.state !== 'closed') {
              this.audioContext?.close().catch(() => {});
            }

            resolve({
              pcmBase64,
              wavBlob,
              wavUrl,
              durationSeconds: Math.round(durationMs / 1000)
            });
          } catch (err) {
            reject(err);
          }
        }
      }, 100);
    });

    return pcmDataPromise;
  }

  cancel() {
    this.isRecording = false;
    this.mediaStream?.getTracks().forEach(t => t.stop());
    if (this.audioContext?.state !== 'closed') {
      this.audioContext?.close().catch(() => {});
    }
  }

  /**
   * Resamples raw audio array to target frequency (linear interpolation)
   */
  private resampleAudio(source: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return source;
    const ratio = fromRate / toRate;
    const newLength = Math.round(source.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIdx = i * ratio;
      const lower = Math.floor(srcIdx);
      const upper = Math.min(lower + 1, source.length - 1);
      const weight = srcIdx - lower;
      result[i] = source[lower] * (1 - weight) + source[upper] * weight;
    }
    return result;
  }

  /**
   * Converts Float32 [-1, 1] samples to signed 16-bit integers (Int16Array)
   */
  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  /**
   * Encodes ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Packs 16-bit PCM buffer into standard WAV file container
   */
  private createWavBlob(samples: Int16Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');

    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, 1, true); // NumChannels (1 = Mono)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
    view.setUint16(34, 16, true); // BitsPerSample (16-bit)

    // data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write the PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      view.setInt16(offset, samples[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }
}
