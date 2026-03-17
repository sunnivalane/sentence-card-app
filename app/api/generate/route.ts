export async function POST(req: Request) {
  try {
    const { sentence } = await req.json();

    // 调用智谱AI
    const response = await fetch(
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`,
        },
        body: JSON.stringify({
          model: "glm-4-flash",
          messages: [
            {
              role: "user",
         content: `请为这个英语句子生成学习卡片。

句子: ${sentence}

⚠️ 必须严格返回 JSON，不要解释，不要多余文字：

{
  "translation": "中文翻译",
  "keywords": "关键词1,关键词2",
  "example": "一个简单英文例句"
}

只返回 JSON。`,

句子: ${sentence}

请严格返回JSON格式：
{
  "translation": "中文翻译",
  "keywords": "关键词（用逗号分隔）",
  "example": "一个简单英文例句"
}`,
            },
          ],
        }),
      }
    );

    const result = await response.json();

    // 👉 打印错误（方便调试）
    console.log("AI返回:", result);

    // 👉 取出AI内容
    let content = result?.choices?.[0]?.message?.content || "";
    // 👉 清理 ```json 包裹（非常关键）
content = content.replace(/```json/g, "").replace(/```/g, "").trim();
    // 👉 尝试解析JSON
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("JSON解析失败:", content);
      parsed = {
        translation: content,
        keywords: "",
        example: "",
      };
    }

    return Response.json(parsed);
  } catch (error) {
    console.error("接口错误:", error);
    return Response.json({ error: "AI generation failed" }, { status: 500 });
  }
}
