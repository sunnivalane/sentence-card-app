"use client";

import { useState, useRef, useEffect } from "react";

type Card = {
  sentence: string;
  translation: string;
  keyWords: string;
  example: string;
  category: string;
  date: string;
  audioURL?: string;
  collapsed?: boolean;
};

export default function Home() {
  const [page, setPage] = useState("record");

  const [sentence, setSentence] = useState("");
  const [translation, setTranslation] = useState("");
  const [keyWords, setKeyWords] = useState("");
  const [example, setExample] = useState("");
  const [category, setCategory] = useState("其他");

  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);

  const [cards, setCards] = useState<Card[]>([]);
  const [filterCategory, setFilterCategory] = useState("All");

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<any>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // ---------------- localStorage
  useEffect(() => {
    const saved = localStorage.getItem("cards");
    if (saved) setCards(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("cards", JSON.stringify(cards));
  }, [cards]);

  // ---------------- 录音 + 转写
  function startRecording() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition not supported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join(" ");
      setSentence(transcript);
    };
    recognition.onstart = () => setRecording(true);
    recognition.onend = () => setRecording(false);

    recognition.start();
    recognitionRef.current = recognition;

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioURL(url);
      };
      recorder.start();
    });
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    mediaRecorderRef.current?.stop();
  }

  function toggleRecording() {
    recording ? stopRecording() : startRecording();
  }

  // ---------------- TTS
  function playTTS(text: string) {
    if (!text) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    window.speechSynthesis.speak(utter);
  }

  // ---------------- 删除卡片
  function deleteCard(index: number) {
    const updated = cards.filter((_, i) => i !== index);
    setCards(updated);
  }

  // ---------------- 折叠卡片
  function toggleCollapse(index: number) {
    const updated = [...cards];
    updated[index].collapsed = !updated[index].collapsed;
    setCards(updated);
  }

  // ---------------- 国内智谱 API 调用
  async function generateAIContent(sentence: string) {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence }),
    });
    const data = await response.json();
    return data; // { translation, keyWords, example }
  }

  // ---------------- 生成 AI 卡片
  async function generateCardWithAI() {
    if (!sentence) return alert("请先输入句子");

    try {
      const aiData = await generateAIContent(sentence);

      const newCard: Card = {
        sentence,
        translation: aiData.translation,
        keyWords: aiData.keyWords,
        example: aiData.example,
        category: category || "其他",
        date: new Date().toLocaleDateString(),
        audioURL: audioURL || undefined,
        collapsed: true,
      };

      setCards([newCard, ...cards]);
      setSentence("");
      setTranslation("");
      setKeyWords("");
      setExample("");
      setAudioURL(null);
      setCategory("其他");
    } catch (err) {
      console.error(err);
      alert("生成 AI 内容失败，请稍后重试");
    }
  }

  // ---------------- 卡片过滤
  const filteredCards = cards.filter(
    (card) => filterCategory === "All" || card.category === filterCategory
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center">

      {/* 顶部导航 */}
      <div className="w-full bg-white shadow p-4 flex justify-center gap-6">
        <button
          onClick={() => setPage("record")}
          className={`font-semibold ${page === "record" ? "text-blue-600" : ""}`}
        >
          🎤 Record
        </button>
        <button
          onClick={() => setPage("library")}
          className={`font-semibold ${page === "library" ? "text-blue-600" : ""}`}
        >
          📚 Library
        </button>
      </div>

      {/* RECORD 页面 */}
      {page === "record" && (
        <div className="p-6 w-full max-w-md space-y-4">
          <button
            onClick={toggleRecording}
            className={`w-full py-2 rounded text-white ${
              recording ? "bg-red-500" : "bg-blue-500"
            }`}
          >
            {recording ? "⏹ Stop Recording" : "🎤 Start Recording"}
          </button>

          <div className="bg-white p-4 rounded shadow space-y-3">
            <div>
              <label>Sentence</label>
              <input
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
                className="w-full border rounded p-1"
              />
            </div>

            <div>
              <label>Translation</label>
              <input
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                className="w-full border rounded p-1"
              />
            </div>

            <div>
              <label>Key Words</label>
              <input
                value={keyWords}
                onChange={(e) => setKeyWords(e.target.value)}
                className="w-full border rounded p-1"
              />
            </div>

            <div>
              <label>Example</label>
              <input
                value={example}
                onChange={(e) => setExample(e.target.value)}
                className="w-full border rounded p-1"
              />
            </div>

            <div>
              <label>Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded p-1"
              >
                <option value="日常闲聊">日常闲聊</option>
                <option value="交通出行">交通出行</option>
                <option value="购物生活服务">购物生活服务</option>
                <option value="课堂/学习">课堂/学习</option>
                <option value="工作">工作</option>
                <option value="用餐">用餐</option>
                <option value="其他">其他</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={generateCardWithAI}
                className="flex-1 bg-green-600 text-white py-2 rounded"
              >
                Generate Card with AI
              </button>
              <button
                onClick={() => playTTS(sentence)}
                className="flex-1 bg-purple-500 text-white py-2 rounded"
              >
                🔊 Play TTS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIBRARY 页面 */}
      {page === "library" && (
        <div className="p-6 w-full max-w-md">
          <div className="mb-4 flex justify-between">
            <span>Filter:</span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="border rounded p-1"
            >
              <option value="All">All</option>
              <option value="日常闲聊">日常闲聊</option>
              <option value="交通出行">交通出行</option>
              <option value="购物生活服务">购物生活服务</option>
              <option value="课堂/学习">课堂/学习</option>
              <option value="工作">工作</option>
              <option value="用餐">用餐</option>
              <option value="其他">其他</option>
            </select>
          </div>

          <div className="space-y-2">
            {filteredCards.map((card, index) => (
              <div key={index} className="bg-white p-3 rounded shadow">
                <div
                  className="cursor-pointer font-semibold"
                  onClick={() => toggleCollapse(index)}
                >
                  {card.sentence} {card.collapsed ? "▼" : "▲"}
                </div>

                {!card.collapsed && (
                  <div className="mt-2 space-y-1">
                    <p>Translation: {card.translation}</p>
                    <p>Key Words: {card.keyWords}</p>
                    <p>Example: {card.example}</p>
                    <p>Category: {card.category}</p>
                    <p>Date: {card.date}</p>

                    {card.audioURL && (
                      <audio controls src={card.audioURL} className="w-full" />
                    )}

                    <button
                      onClick={() => playTTS(card.sentence)}
                      className="text-blue-600 mt-1"
                    >
                      🔊 Play TTS
                    </button>

                    <button
                      onClick={() => deleteCard(index)}
                      className="text-red-500 ml-4 mt-1"
                    >
                      🗑 Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
