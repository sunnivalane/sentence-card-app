"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Card = {
  id: string;
  sentence: string;
  translation: string;
  keywords: string;
  example: string;
  category: string;
  status: string;
  audioData?: string;
  showTranslation?: boolean;
};

const STORAGE_KEY = "sentence-card-app-cards";

const CATEGORY_OPTIONS = [
  "日常交流",
  "餐厅点餐",
  "出行交通",
  "购物",
  "学习",
  "工作",
  "其他",
];

const STATUS_OPTIONS = ["待复习", "学习中", "已掌握"];

type TabType = "generate" | "cards";

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>("generate");
  const [sentence, setSentence] = useState("");
  const [category, setCategory] = useState("日常交流");
  const [keywordMode, setKeywordMode] = useState("重点表达");
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [expandedCategories, setExpandedCategories] = useState<string[]>([
    "日常交流",
  ]);
  const [recentCategory, setRecentCategory] = useState("");
  const [highlightCardId, setHighlightCardId] = useState("");

  const [searchText, setSearchText] = useState("");
  const [filterCategory, setFilterCategory] = useState("全部");
  const [filterStatus, setFilterStatus] = useState("全部");
  const [showFilters, setShowFilters] = useState(false);

  const [isCapturing, setIsCapturing] = useState(false);
  const [recordedAudioData, setRecordedAudioData] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [recordingCardId, setRecordingCardId] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const finalTranscriptRef = useRef("");

  useEffect(() => {
    try {
      const savedCards = localStorage.getItem(STORAGE_KEY);
      if (savedCards) {
        const parsedCards = JSON.parse(savedCards);

        const normalizedCards = parsedCards.map((card: any, index: number) => ({
          id: card.id || `old-card-${Date.now()}-${index}`,
          sentence: card.sentence || "",
          translation: card.translation || "",
          keywords: card.keywords || "",
          example: card.example || "",
          category: card.category || "其他",
          status: card.status || "待复习",
          audioData: card.audioData || "",
          showTranslation: card.showTranslation || false,
        }));

        setCards(normalizedCards);
      }
    } catch (err) {
      console.error("读取本地卡片失败:", err);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    } catch (err) {
      console.error("保存本地卡片失败:", err);
    }
  }, [cards]);

  useEffect(() => {
    const categoriesInCards = Array.from(
      new Set(cards.map((card) => card.category))
    );

    setExpandedCategories((prev) => {
      const merged = [...prev];
      categoriesInCards.forEach((cat) => {
        if (!merged.includes(cat)) merged.push(cat);
      });
      return merged;
    });
  }, [cards]);
  useEffect(() => {
    function loadVoices() {
      const loadedVoices = window.speechSynthesis.getVoices();
      setVoices(loadedVoices);
    }

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (!highlightCardId) return;

    const timer = setTimeout(() => {
      setHighlightCardId("");
    }, 3000);

    return () => clearTimeout(timer);
  }, [highlightCardId]);

  useEffect(() => {
    return () => {
      stopAllCaptureResources();
      window.speechSynthesis.cancel();
    };
  }, []);

  function stopStreamTracks() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function stopSpeechRecognition() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.error("停止语音识别失败:", err);
      }
      recognitionRef.current = null;
    }
  }

  function stopAllCaptureResources() {
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch (err) {
        console.error("停止录音失败:", err);
      }
      mediaRecorderRef.current = null;
    }

    stopSpeechRecognition();
    stopStreamTracks();
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("录音转换失败"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function startCapture(targetCardId?: string) {
    try {
      setCaptureError("");

      // 先强制结束上一轮残留状态，避免手机端第二次录音失效
      stopSpeechRecognition();

      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
          }
        } catch (err) {
          console.error("清理旧录音器失败:", err);
        }
        mediaRecorderRef.current = null;
      }

      stopStreamTracks();

      // 再开始新一轮
      setRecordedAudioData("");
      setRecordingCardId(targetCardId || "");
      setIsCapturing(false);

      finalTranscriptRef.current = "";
      audioChunksRef.current = [];

      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setCaptureError("当前浏览器不支持语音转文字，请优先使用 Chrome");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, {
              type: "audio/webm",
            });
            const base64Audio = await blobToBase64(audioBlob);

            if (targetCardId) {
              setCards((prev) =>
                prev.map((card) =>
                  card.id === targetCardId
                    ? { ...card, audioData: base64Audio }
                    : card
                )
              );
            } else {
              setRecordedAudioData(base64Audio);
            }
          }
        } catch (err) {
          console.error(err);
          setCaptureError("录音处理失败");
        } finally {
          stopStreamTracks();
          mediaRecorderRef.current = null;
          setRecordingCardId("");
          setIsCapturing(false);
        }
      };

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = finalTranscriptRef.current;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + " ";
          } else {
            interimTranscript += transcript;
          }
        }

        finalTranscriptRef.current = finalTranscript;
        setSentence((finalTranscript + interimTranscript).trim());
      };

      recognition.onerror = (event: any) => {
        if (event.error === "aborted") {
          return;
        }

        console.error("语音识别错误:", event.error);
        setCaptureError("语音转文字失败，请重试");
      };

      recognitionRef.current = recognition;

      await new Promise((resolve) => setTimeout(resolve, 200));

      mediaRecorder.start();
      recognition.start();
      setIsCapturing(true);
    } catch (err) {
      console.error(err);
      setCaptureError("无法开始录音，请检查麦克风权限");
      stopAllCaptureResources();
      setIsCapturing(false);
    }
  }

  function stopCapture() {
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      stopSpeechRecognition();
    } catch (err) {
      console.error(err);
      setCaptureError("停止录音失败");
    } finally {
      setIsCapturing(false);
    }
  }

  function playStandardSpeech(text: string) {
    if (!text.trim()) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.88;
    utterance.pitch = 1;

    const preferredVoice =
      voices.find((voice) => voice.name.includes("Samantha")) ||
      voices.find((voice) => voice.name.includes("Ava")) ||
      voices.find((voice) => voice.name.includes("Allison")) ||
      voices.find((voice) => voice.name.includes("Alex")) ||
      voices.find((voice) => voice.name.includes("Daniel")) ||
      voices.find(
        (voice) => voice.lang === "en-US" && voice.localService === true
      ) ||
      voices.find((voice) => voice.lang === "en-US") ||
      voices.find((voice) => voice.lang.startsWith("en"));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
      console.log("当前标准发音 voice:", preferredVoice.name, preferredVoice.lang);
    }

    window.speechSynthesis.speak(utterance);
  }

  async function generateAIContent() {
    if (!sentence.trim()) {
      setError("请先输入一句英文");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sentence, keywordMode }),
      });

      const data = await response.json();

      if (data.error) {
        setError("生成失败，请检查 API Key 或稍后重试");
        return;
      }

      const newCard: Card = {
        id: crypto.randomUUID(),
        sentence,
        translation: data.translation || "",
        keywords: data.keywords || "",
        example: data.example || "",
        category,
        status: "待复习",
        audioData: recordedAudioData || "",
        showTranslation: false,
      };

      setHighlightCardId(newCard.id);
      setCards((prev) => [newCard, ...prev]);
      setSentence("");
      setRecordedAudioData("");
      setActiveTab("cards");
      setFilterCategory("全部");
      setFilterStatus("全部");
      setSearchText("");
      setRecentCategory(category);
      setExpandedCategories((prev) =>
        prev.includes(category) ? prev : [category, ...prev]
      );
    } catch (err) {
      console.error("请求失败:", err);
      setError("请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  function updateCard(id: string, field: keyof Card, value: string | boolean) {
    if (field === "status" && value === "已掌握") {
      const shouldDelete = window.confirm(
        '这张卡片已标记为“已掌握”。\n\n点击“确定”会直接删除这张卡片。\n点击“取消”会保留这张卡片。'
      );

      if (shouldDelete) {
        deleteCard(id);
        return;
      }
    }

    setCards((prev) =>
      prev.map((card) =>
        card.id === id ? { ...card, [field]: value } : card
      )
    );

    if (field === "category" && typeof value === "string") {
      setRecentCategory(value);
      setExpandedCategories((prev) =>
        prev.includes(value) ? prev : [value, ...prev]
      );
    }
  }

  function toggleTranslation(id: string) {
    setCards((prev) =>
      prev.map((card) =>
        card.id === id
          ? { ...card, showTranslation: !card.showTranslation }
          : card
      )
    );
  }

  function deleteCard(id: string) {
    setCards((prev) => prev.filter((card) => card.id !== id));
  }

  function clearAllCards() {
    const ok = window.confirm("确定要清空全部卡片吗？");
    if (!ok) return;
    setCards([]);
  }

  function toggleCategory(categoryName: string) {
    setExpandedCategories((prev) =>
      prev.includes(categoryName)
        ? prev.filter((item) => item !== categoryName)
        : [...prev, categoryName]
    );
  }

  const filteredCards = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return cards.filter((card) => {
      const matchCategory =
        filterCategory === "全部" || card.category === filterCategory;

      const matchStatus =
        filterStatus === "全部" || card.status === filterStatus;

      const matchSearch =
        !keyword ||
        card.sentence.toLowerCase().includes(keyword) ||
        card.keywords.toLowerCase().includes(keyword) ||
        card.example.toLowerCase().includes(keyword);

      return matchCategory && matchStatus && matchSearch;
    });
  }, [cards, filterCategory, filterStatus, searchText]);

  function expandAllCategories() {
    const allCategories = Array.from(
      new Set(filteredCards.map((card) => card.category))
    );
    setExpandedCategories(allCategories);
  }

  function collapseAllCategories() {
    setExpandedCategories([]);
  }

  const groupedCards = useMemo(() => {
    const groups: Record<string, Card[]> = {};

    CATEGORY_OPTIONS.forEach((cat) => {
      groups[cat] = [];
    });

    filteredCards.forEach((card) => {
      if (!groups[card.category]) {
        groups[card.category] = [];
      }
      groups[card.category].push(card);
    });

    return groups;
  }, [filteredCards]);

  const visibleCategories = useMemo(() => {
    const categories = Object.entries(groupedCards)
      .filter(([, list]) => list.length > 0)
      .map(([categoryName]) => categoryName);

    if (!recentCategory || !categories.includes(recentCategory)) {
      return categories;
    }

    return [
      recentCategory,
      ...categories.filter((item) => item !== recentCategory),
    ];
  }, [groupedCards, recentCategory]);

  const tabButtonStyle = (tab: TabType) => ({
    border: "none",
    borderRadius: "12px",
    padding: "12px 22px",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
    backgroundColor: activeTab === tab ? "#2563eb" : "#e5e7eb",
    color: activeTab === tab ? "#ffffff" : "#111827",
  });
  function clearCurrentRecording() {
    setRecordedAudioData("");
    setCaptureError("");
  }
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#f6f7fb",
        padding: "32px 20px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        <h1
          style={{
            fontSize: "36px",
            fontWeight: 700,
            marginBottom: "12px",
            color: "#111827",
          }}
        >
          AI 英语学习卡片
        </h1>

        <p
          style={{
            fontSize: "16px",
            color: "#6b7280",
            marginBottom: "24px",
          }}
        >
          支持手动输入，也支持一次录音完成转写和保存。
        </p>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "28px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setActiveTab("generate")}
            style={tabButtonStyle("generate")}
          >
            生成卡片
          </button>

          <button
            onClick={() => setActiveTab("cards")}
            style={tabButtonStyle("cards")}
          >
            我的卡片
          </button>
        </div>

        {activeTab === "generate" && (
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
              marginBottom: "28px",
            }}
          >
            <div
              style={{
                marginBottom: "20px",
                padding: "16px",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                backgroundColor: "#fafafa",
              }}
            >
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  marginBottom: "10px",
                  color: "#111827",
                }}
              >
                语音输入（一次录音 = 转文字 + 保存音频）
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: "12px",
                }}
              >
                {!isCapturing ? (
                  <button
                    onClick={() => startCapture()}
                    style={{
                      backgroundColor: "#2563eb",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "12px",
                      padding: "10px 18px",
                      fontSize: "15px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    开始录音
                  </button>
                ) : (
                  <button
                    onClick={stopCapture}
                    style={{
                      backgroundColor: "#dc2626",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "12px",
                      padding: "10px 18px",
                      fontSize: "15px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    停止录音
                  </button>
                )}

                <span
                  style={{
                    fontSize: "14px",
                    color: isCapturing ? "#dc2626" : "#6b7280",
                    fontWeight: 500,
                  }}
                >
                  {isCapturing
                    ? "录音中，会同时转写文字并保存录音..."
                    : recordedAudioData
                      ? "本次录音已准备好，可直接生成卡片"
                      : "点击开始录音，说一句英文，停止后会自动填入输入框"}
                </span>
              </div>

              {captureError && (
                <div
                  style={{
                    color: "#dc2626",
                    fontSize: "14px",
                    marginBottom: "10px",
                  }}
                >
                  {captureError}
                </div>
              )}

              {recordedAudioData && (
                <div>
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#6b7280",
                      marginBottom: "8px",
                    }}
                  >
                    录音预览
                  </div>
                  <audio controls src={recordedAudioData} />
                </div>
              )}
            </div>

            <label
              style={{
                display: "block",
                fontSize: "16px",
                fontWeight: 600,
                marginBottom: "10px",
                color: "#111827",
              }}
            >
              英文原句（可手动修改）
            </label>

            <textarea
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder="例如：Do you like drinking coffee?"
              rows={3}
              style={{
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: "12px",
                padding: "14px 16px",
                fontSize: "18px",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                marginBottom: "16px",
              }}
            />

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "15px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: "#111827",
                }}
              >
                选择分类
              </label>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: "220px",
                  border: "1px solid #d1d5db",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  fontSize: "16px",
                  backgroundColor: "#ffffff",
                }}
              >
                {CATEGORY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "15px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: "#111827",
                }}
              >
                关键词模式
              </label>

              <select
                value={keywordMode}
                onChange={(e) => setKeywordMode(e.target.value)}
                style={{
                  width: "220px",
                  border: "1px solid #d1d5db",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  fontSize: "16px",
                  backgroundColor: "#ffffff",
                }}
              >
                <option value="重点表达">重点表达</option>
                <option value="实用短语">实用短语</option>
                <option value="基础词汇">基础词汇</option>
              </select>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={generateAIContent}
                disabled={loading}
                style={{
                  backgroundColor: loading ? "#9ca3af" : "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "12px",
                  padding: "12px 22px",
                  fontSize: "16px",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "生成中..." : "生成卡片"}
              </button>

              <button
                onClick={() => {
                  setSentence("");
                  setError("");
                  setCaptureError("");
                  setRecordedAudioData("");
                }}
                style={{
                  backgroundColor: "#eef2ff",
                  color: "#3730a3",
                  border: "none",
                  borderRadius: "12px",
                  padding: "12px 22px",
                  fontSize: "16px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                清空输入
              </button>
            </div>

            {error && (
              <p
                style={{
                  marginTop: "14px",
                  color: "#dc2626",
                  fontSize: "15px",
                  fontWeight: 500,
                }}
              >
                {error}
              </p>
            )}
          </div>
        )}

        {activeTab === "cards" && (
          <>
            <div
              style={{
                marginBottom: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <h2
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#111827",
                  margin: 0,
                }}
              >
                我的卡片
              </h2>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                  }}
                >
                  共 {filteredCards.length} / {cards.length} 张卡片
                </span>

                <button
                  onClick={() => setShowFilters((prev) => !prev)}
                  style={{
                    backgroundColor: "#eef2ff",
                    color: "#3730a3",
                    border: "none",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {showFilters ? "收起筛选" : "展开筛选"}
                </button>

                {cards.length > 0 && (
                  <>
                    <button
                      onClick={expandAllCategories}
                      style={{
                        backgroundColor: "#dbeafe",
                        color: "#1d4ed8",
                        border: "none",
                        borderRadius: "12px",
                        padding: "10px 16px",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      全部展开
                    </button>

                    <button
                      onClick={collapseAllCategories}
                      style={{
                        backgroundColor: "#e5e7eb",
                        color: "#111827",
                        border: "none",
                        borderRadius: "12px",
                        padding: "10px 16px",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      全部收起
                    </button>

                    <button
                      onClick={clearAllCards}
                      style={{
                        backgroundColor: "#fee2e2",
                        color: "#b91c1c",
                        border: "none",
                        borderRadius: "12px",
                        padding: "10px 16px",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      清空全部卡片
                    </button>
                  </>
                )}
              </div>
            </div>

            {showFilters && (
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  padding: "18px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
                  marginBottom: "20px",
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "end",
                }}
              >
                <div style={{ flex: "1 1 320px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    搜索卡片
                  </label>
                  <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="可搜索原句、关键词、例句"
                    style={{
                      width: "100%",
                      border: "1px solid #d1d5db",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      fontSize: "15px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ minWidth: "220px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    分类筛选
                  </label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    style={{
                      width: "100%",
                      border: "1px solid #d1d5db",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      fontSize: "15px",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <option value="全部">全部</option>
                    {CATEGORY_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ minWidth: "220px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    状态筛选
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    style={{
                      width: "100%",
                      border: "1px solid #d1d5db",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      fontSize: "15px",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <option value="全部">全部</option>
                    {STATUS_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                {(searchText || filterCategory !== "全部" || filterStatus !== "全部") && (
                  <button
                    onClick={() => {
                      setSearchText("");
                      setFilterCategory("全部");
                      setFilterStatus("全部");
                    }}
                    style={{
                      backgroundColor: "#eef2ff",
                      color: "#3730a3",
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px 16px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    清除筛选
                  </button>
                )}
              </div>
            )}
            {filteredCards.length === 0 ? (
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  padding: "28px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
                  color: "#6b7280",
                  fontSize: "16px",
                }}
              >
                没有找到符合条件的卡片。
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "18px",
                }}
              >
                {visibleCategories.map((categoryName) => {
                  const categoryCards = groupedCards[categoryName] || [];
                  const isExpanded = expandedCategories.includes(categoryName);

                  return (
                    <div
                      key={categoryName}
                      style={{
                        backgroundColor:
                          recentCategory === categoryName ? "#f8fbff" : "#ffffff",
                        borderRadius: "16px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
                        overflow: "hidden",
                        border:
                          recentCategory === categoryName
                            ? "2px solid #3b82f6"
                            : "1px solid transparent",
                        transition: "all 0.3s ease",
                      }}
                    >
                      <button
                        onClick={() => toggleCategory(categoryName)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          backgroundColor: "#f8fafc",
                          border: "none",
                          padding: "18px 20px",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "18px",
                          fontWeight: 700,
                          color: "#111827",
                        }}
                      >
                        <span>
                          {isExpanded ? "▼" : "▶"} {categoryName}
                        </span>
                        <span
                          style={{
                            fontSize: "14px",
                            fontWeight: 500,
                            color: "#6b7280",
                          }}
                        >
                          {categoryCards.length} 张
                        </span>
                      </button>

                      {isExpanded && (
                        <div
                          style={{
                            padding: "18px",
                            display: "grid",
                            gap: "18px",
                          }}
                        >
                          {categoryCards.map((card) => (
                            <div
                              key={card.id}
                              style={{
                                backgroundColor:
                                  highlightCardId === card.id
                                    ? "#eff6ff"
                                    : "#ffffff",
                                borderRadius: "16px",
                                padding: "24px",
                                border:
                                  highlightCardId === card.id
                                    ? "2px solid #3b82f6"
                                    : "1px solid #e5e7eb",
                                transition: "all 0.3s ease",
                              }}
                            >
                              <div
                                style={{
                                  marginBottom: "18px",
                                  paddingBottom: "14px",
                                  borderBottom: "1px solid #e5e7eb",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "14px",
                                    color: "#6b7280",
                                    marginBottom: "8px",
                                  }}
                                >
                                  我的录音
                                </div>

                                {card.audioData ? (
                                  <audio controls src={card.audioData} />
                                ) : (
                                  <div
                                    style={{
                                      color: "#9ca3af",
                                      fontSize: "14px",
                                      marginBottom: "12px",
                                    }}
                                  >
                                    这张卡片还没有录音
                                  </div>
                                )}

                                <div
                                  style={{
                                    marginTop: "12px",
                                    display: "flex",
                                    gap: "10px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <button
                                    onClick={() => {
                                      if (isCapturing && recordingCardId === card.id) {
                                        stopCapture();
                                      } else {
                                        startCapture(card.id);
                                      }
                                    }}
                                    style={{
                                      backgroundColor:
                                        isCapturing && recordingCardId === card.id ? "#dc2626" : "#dbeafe",
                                      color:
                                        isCapturing && recordingCardId === card.id ? "#ffffff" : "#1d4ed8",
                                      border: "none",
                                      borderRadius: "10px",
                                      padding: "10px 14px",
                                      fontSize: "14px",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {isCapturing && recordingCardId === card.id ? "停止录音" : "重新录音"}
                                  </button>
                                </div>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    color: "#6b7280",
                                    marginTop: "14px",
                                    marginBottom: "8px",
                                  }}
                                >
                                  标准发音
                                </div>

                                <button
                                  onClick={() => playStandardSpeech(card.sentence)}
                                  style={{
                                    backgroundColor: "#dbeafe",
                                    color: "#1d4ed8",
                                    border: "none",
                                    borderRadius: "10px",
                                    padding: "10px 14px",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  播放标准发音
                                </button>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "18px",
                                  paddingBottom: "14px",
                                  borderBottom: "1px solid #e5e7eb",
                                  gap: "12px",
                                }}
                              >
                                <div style={{ flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: "14px",
                                      color: "#6b7280",
                                      marginBottom: "8px",
                                    }}
                                  >
                                    原句
                                  </div>
                                  <textarea
                                    value={card.sentence}
                                    onChange={(e) =>
                                      updateCard(card.id, "sentence", e.target.value)
                                    }
                                    rows={2}
                                    style={{
                                      width: "100%",
                                      border: "1px solid #d1d5db",
                                      borderRadius: "10px",
                                      padding: "10px 12px",
                                      fontSize: "18px",
                                      fontWeight: 600,
                                      color: "#111827",
                                      resize: "vertical",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                </div>

                                <button
                                  onClick={() => deleteCard(card.id)}
                                  style={{
                                    alignSelf: "flex-start",
                                    backgroundColor: "#fee2e2",
                                    color: "#b91c1c",
                                    border: "none",
                                    borderRadius: "10px",
                                    padding: "10px 14px",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  删除
                                </button>
                              </div>

                              <div style={{ marginBottom: "14px" }}>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    color: "#6b7280",
                                    marginBottom: "6px",
                                  }}
                                >
                                  分类
                                </div>
                                <select
                                  value={card.category}
                                  onChange={(e) =>
                                    updateCard(card.id, "category", e.target.value)
                                  }
                                  style={{
                                    width: "220px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "10px",
                                    padding: "10px 12px",
                                    fontSize: "16px",
                                    backgroundColor: "#ffffff",
                                  }}
                                >
                                  {CATEGORY_OPTIONS.map((item) => (
                                    <option key={item} value={item}>
                                      {item}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div style={{ marginBottom: "14px" }}>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    color: "#6b7280",
                                    marginBottom: "6px",
                                  }}
                                >
                                  学习状态
                                </div>
                                <select
                                  value={card.status}
                                  onChange={(e) =>
                                    updateCard(card.id, "status", e.target.value)
                                  }
                                  style={{
                                    width: "220px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "10px",
                                    padding: "10px 12px",
                                    fontSize: "16px",
                                    backgroundColor: "#ffffff",
                                  }}
                                >
                                  {STATUS_OPTIONS.map((item) => (
                                    <option key={item} value={item}>
                                      {item}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div style={{ marginBottom: "14px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    marginBottom: "8px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "14px",
                                      color: "#6b7280",
                                    }}
                                  >
                                    中文翻译
                                  </div>

                                  <button
                                    onClick={() => toggleTranslation(card.id)}
                                    style={{
                                      backgroundColor: "#eef2ff",
                                      color: "#3730a3",
                                      border: "none",
                                      borderRadius: "999px",
                                      padding: "6px 12px",
                                      fontSize: "13px",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {card.showTranslation ? "隐藏翻译" : "显示翻译"}
                                  </button>
                                </div>

                                {card.showTranslation && (
                                  <textarea
                                    value={card.translation}
                                    onChange={(e) =>
                                      updateCard(card.id, "translation", e.target.value)
                                    }
                                    rows={2}
                                    style={{
                                      width: "100%",
                                      border: "1px solid #d1d5db",
                                      borderRadius: "10px",
                                      padding: "10px 12px",
                                      fontSize: "18px",
                                      color: "#111827",
                                      resize: "vertical",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                )}
                              </div>

                              <div style={{ marginBottom: "14px" }}>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    color: "#6b7280",
                                    marginBottom: "6px",
                                  }}
                                >
                                  关键词
                                </div>
                                <textarea
                                  value={card.keywords}
                                  onChange={(e) =>
                                    updateCard(card.id, "keywords", e.target.value)
                                  }
                                  rows={2}
                                  style={{
                                    width: "100%",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "10px",
                                    padding: "10px 12px",
                                    fontSize: "16px",
                                    color: "#111827",
                                    resize: "vertical",
                                    boxSizing: "border-box",
                                  }}
                                />
                              </div>

                              <div>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    color: "#6b7280",
                                    marginBottom: "6px",
                                  }}
                                >
                                  例句
                                </div>
                                <textarea
                                  value={card.example}
                                  onChange={(e) =>
                                    updateCard(card.id, "example", e.target.value)
                                  }
                                  rows={3}
                                  style={{
                                    width: "100%",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "10px",
                                    padding: "10px 12px",
                                    fontSize: "16px",
                                    color: "#111827",
                                    resize: "vertical",
                                    boxSizing: "border-box",
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}