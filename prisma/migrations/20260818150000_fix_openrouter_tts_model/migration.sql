UPDATE "AppSettings"
SET
  "ttsModel" = 'hexgrad/kokoro-82m',
  "ttsVoiceQuestion" = CASE
    WHEN "ttsVoiceQuestion" IN ('onyx', 'am_onyx') THEN 'am_onyx'
    ELSE "ttsVoiceQuestion"
  END,
  "ttsVoiceAnswer" = CASE
    WHEN "ttsVoiceAnswer" IN ('nova', 'af_nova') THEN 'af_nova'
    ELSE "ttsVoiceAnswer"
  END
WHERE "ttsModel" IN ('openai/tts-1-hd', 'openai/tts-1', 'tts-1-hd', 'tts-1');
