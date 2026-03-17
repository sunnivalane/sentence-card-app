"use client";

import { useState } from "react";

export default function Home() {
  const [sentence, setSentence] = useState("");
  const [cards, setCards] = useState<any[]>([]);

  async function generateAIContent() {
    if (!sentence) return;

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sentence }),
      });

      const data = await response.json();

      console.log("前端拿到的数据:", data);

      setCards([
        {
          translation: data.translation || "",
          keywords: data.keywords || "",
          example: data.example || "",
        },
      ]);
    } catch (error) {
      console.error("请求失败:", error);
    }
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
            <p><strong>翻译：</strong>{card.translation}</p >
            <p><strong>关键词：</strong>{card.keywords}</p >
            <p><strong>例句：</strong>{card.example}</p >
          </div>
        ))}
      </div>
    </main>
  );
}
