const TTS_API_KEY = "AIzaSyC7M7yIo9uAYRhPE2f10oy5vbPCCI7WMRU";

export const speak = async (text: string, language: 'en' | 'de') => {
  const languageCode = language === 'en' ? 'en-US' : 'de-DE';
  const voiceName = language === 'en' ? 'en-US-Standard-C' : 'de-DE-Standard-A';

  try {
    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_API_KEY}`, {
      method: 'POST',
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    });

    const data = await response.json();
    if (data.audioContent) {
      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      audio.play();
    }
  } catch (error) {
    console.error("TTS Error:", error);
    // Fallback to browser TTS if API fails
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageCode;
    window.speechSynthesis.speak(utterance);
  }
};
