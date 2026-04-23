import EventBus from '../core/EventBus.js';

export default class OszLoader {
  constructor(audioEngine) {
    this.audio = audioEngine;
  }

  async load(file) {
    try {
      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Extract ZIP using fflate
      const fflate = await import('fflate');
      const unzipped = fflate.unzipSync(new Uint8Array(arrayBuffer));
      
      // Find .osu file
      let osuFileName = null;
      let osuContent = null;
      const audioFiles = {};
      const imageFiles = {};
      const videoFiles = {};
      
      for (const [filename, data] of Object.entries(unzipped)) {
        const lower = filename.toLowerCase();
        if (lower.endsWith('.osu') && !osuFileName) {
          osuFileName = filename;
          osuContent = new TextDecoder().decode(data);
        } else if (lower.endsWith('.mp3') || lower.endsWith('.ogg') || lower.endsWith('.wav')) {
          audioFiles[lower] = data;
        } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) {
          imageFiles[lower] = data;
        } else if (lower.endsWith('.mp4') || lower.endsWith('.avi') || lower.endsWith('.webm')) {
          videoFiles[lower] = data;
        }
      }
      
      if (!osuContent) {
        throw new Error('No .osu file found in archive');
      }
      
      // Parse .osu file
      const parsed = this._parseOsu(osuContent);
      
      // Decode audio
      let audioBuffer = null;
      const audioFileName = parsed.general.AudioFilename?.toLowerCase();
      if (audioFileName && audioFiles[audioFileName]) {
        const audioData = audioFiles[audioFileName];
        audioBuffer = await this.audio.decodeBuffer(audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength));
      } else {
        // Try first audio file found
        const firstAudio = Object.values(audioFiles)[0];
        if (firstAudio) {
          audioBuffer = await this.audio.decodeBuffer(firstAudio.buffer.slice(firstAudio.byteOffset, firstAudio.byteOffset + firstAudio.byteLength));
        }
      }
      
      // Create background image URL
      let backgroundUrl = null;
      const bgFileName = parsed.background?.toLowerCase();
      if (bgFileName && imageFiles[bgFileName]) {
        const blob = new Blob([imageFiles[bgFileName]], { type: bgFileName.endsWith('.png') ? 'image/png' : 'image/jpeg' });
        backgroundUrl = URL.createObjectURL(blob);
      } else {
        // Try first image file
        const firstImage = Object.entries(imageFiles)[0];
        if (firstImage) {
          const ext = firstImage[0].split('.').pop();
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          const blob = new Blob([firstImage[1]], { type: mime });
          backgroundUrl = URL.createObjectURL(blob);
        }
      }
      
      // Create video URL
      let videoUrl = null;
      const firstVideo = Object.entries(videoFiles)[0];
      if (firstVideo) {
        const ext = firstVideo[0].split('.').pop();
        const mimeMap = { mp4: 'video/mp4', avi: 'video/avi', webm: 'video/webm' };
        const blob = new Blob([firstVideo[1]], { type: mimeMap[ext] || 'video/mp4' });
        videoUrl = URL.createObjectURL(blob);
      }
      
      // Build lane count from CircleSize
      const laneCount = parsed.difficulty.CircleSize || 4;
      
      // Build notes from HitObjects
      const notes = parsed.hitObjects.map((ho, i) => {
        const lane = Math.floor((ho.x * laneCount) / 512);
        const time = ho.time / 1000; // ms → seconds
        const duration = (ho.endTime ? (ho.endTime - ho.time) : 0) / 1000;
        return {
          id: i,
          lane: Math.min(lane, laneCount - 1), // clamp
          time,
          duration,
          type: duration > 0 ? 'hold' : 'tap'
        };
      });
      
      // Build BPM changes from TimingPoints
      const bpmChanges = parsed.timingPoints
        .filter(tp => tp.msPerBeat > 0)
        .map(tp => ({
          time: tp.offset / 1000,
          bpm: 60000 / tp.msPerBeat
        }));
      
      const primaryBpm = bpmChanges.length > 0 ? bpmChanges[0].bpm : 120;
      
      // Calculate duration from last note or timing point
      const lastNote = notes.length > 0 ? notes[notes.length - 1] : null;
      const duration = lastNote ? (lastNote.time + lastNote.duration + 2) * 1000 : 0; // +2s buffer
      
      return {
        metadata: {
          title: parsed.metadata.Title || 'Unknown',
          artist: parsed.metadata.Artist || 'Unknown',
          version: parsed.metadata.Version || 'Normal',
          creator: parsed.metadata.Creator || '',
          previewTime: parsed.general.PreviewTime || 0,
          bpm: Math.round(primaryBpm),
          duration: Math.round(duration)
        },
        audioBuffer,
        backgroundUrl,
        videoUrl,
        bpmChanges,
        notes
      };
    } catch (err) {
      console.error('OszLoader error:', err);
      throw err;
    }
  }

  _parseOsu(content) {
    const result = {
      general: {},
      metadata: {},
      difficulty: {},
      timingPoints: [],
      hitObjects: [],
      background: null
    };
    
    const lines = content.split(/\r?\n/);
    let section = '';
    
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;
      
      // Section header
      const sectionMatch = line.match(/^\[(\w+)\]$/);
      if (sectionMatch) {
        section = sectionMatch[1];
        continue;
      }
      
      if (section === 'General') {
        const [key, ...rest] = line.split(':');
        result.general[key.trim()] = rest.join(':').trim();
      } else if (section === 'Metadata') {
        const [key, ...rest] = line.split(':');
        result.metadata[key.trim()] = rest.join(':').trim();
      } else if (section === 'Difficulty') {
        const [key, ...rest] = line.split(':');
        result.difficulty[key.trim()] = parseFloat(rest.join(':').trim());
      } else if (section === 'TimingPoints') {
        const parts = line.split(',');
        if (parts.length >= 2) {
          result.timingPoints.push({
            offset: parseFloat(parts[0]),
            msPerBeat: parseFloat(parts[1]),
            meter: parts.length > 2 ? parseInt(parts[2]) : 4,
            inherited: parseFloat(parts[1]) < 0
          });
        }
      } else if (section === 'HitObjects') {
        const parts = line.split(',');
        if (parts.length >= 4) {
          const x = parseFloat(parts[0]);
          const y = parseFloat(parts[1]);
          const time = parseFloat(parts[2]);
          const type = parseInt(parts[3]);
          
          let endTime = 0;
          // type bitmask: 1=circle, 2=slider, 8=spinner
          if (type & 2 && parts.length >= 7) {
            // Slider: estimate duration from slider length and slider velocity
            // For simplicity, use endTime if available
            const slides = parseInt(parts[6]) || 1;
            const length = parseFloat(parts[7]) || 0;
            // Approximate: use timing point BPM
            const tp = result.timingPoints.find(tp => tp.msPerBeat > 0 && tp.offset <= time);
            const sv = tp ? (tp.msPerBeat / 1000) : 1;
            // Slider velocity from difficulty
            const sliderMult = result.difficulty.SliderMultiplier || 1.4;
            const duration = (length * sv * slides) / (sliderMult * 100);
            endTime = time + duration;
          } else if (type & 8 && parts.length >= 6) {
            // Spinner
            endTime = parseFloat(parts[5]);
          }
          
          result.hitObjects.push({ x, y, time, type, endTime });
        }
      } else if (section === 'Events') {
        // Parse background image
        if (line.startsWith('0,0,')) {
          const bgPart = line.substring(4).trim();
          // Remove quotes if present
          result.background = bgPart.replace(/^"|"$/g, '');
        }
      }
    }
    
    return result;
  }
}
