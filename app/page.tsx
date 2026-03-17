"use client";

import { useState } from "react";

export default function Home() {
  const [sentence, setSentence] = useState("");
  const [cards, setCards] = useState<any[]>([]);

  async function generateAIContent() {
    if (!sentence) return;

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sentence }),
    });

    const data = await response.json();

    console.log("前端拿到的数据:", data);

    // ✅ 关键：字段统一
    setCards([
      {
        translation: data.translation || "",
        keywords: data.keywords || "",
        example: data.example || "",
        collapsed: false,
      },
    ]);

    // ✅ 可选：不清空输入（避免你以为“消失了”）
    // setSentence("");
  }

  function toggleCollapse(index: number) {
    const updated = [...cards];
    updated[index].collapsed = !updated[index].collapsed;
    setCards(updated);
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>AI 英语学习卡片</h1>

      <input
        value={sentence}
        onChange={(e) => setSentence(e.target.value)}
        placeholder="输入一句英文"
        style={{ width: "300px", marginRight: "10px" }}
      />

      <button onClick={generateAIContent}>生成卡片</button>

      <div style={{ marginTop: 20 }}>
        {cards.map((card, index) => (
          <div
            key={index}
            style={{
              border: "1px solid #ccc",
              padding: 10,
              marginBottom: 10,
            }}
          >
            <div
              onClick={() => toggleCollapse(index)}
              style={{ cursor: "pointer", fontWeight: "bold" }}
            >
              翻译: {card.translation}
            </div>

            {!card.collapsed && (
              <div style={{ marginTop: 10 }}>
                <div>关键词: {card.keywords}</div>
                <div>例句: {card.example}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
