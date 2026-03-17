export async function POST(req: Request) {
  try {
    const { sentence } = await req.json();

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
              content: `请为这个英语句子生成学习卡片：

句子: ${sentence}

请严格返回JSON格式:
{
  "translation": "中文翻译",
  "keywords": "关键词(用逗号分隔)",
  "example": "一个简单英文例句"
}`,
            },
          ],
        }),
      }
    );

    const result = await response.json();
    console.log("完整AI返回:", JSON.stringify(result, null, 2));

    let content =
      result?.choices?.[0]?.message?.content || "";

    content = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("解析失败:", content);
      parsed = {
        translation: content,
        keywords: "",
        example: "",
      };
    }

    return Response.json(parsed);

  } catch (error) {
    console.error("接口错误:", error);
    return Response.json(
      { error: "AI generation failed" },
      { status: 500 }
    );
  }
}
