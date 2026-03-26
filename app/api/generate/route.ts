export async function POST(req: Request) {
  try {
const { sentence, keywordMode } = await req.json();

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

关键词模式: ${keywordMode || "重点表达"}

请严格只返回 JSON，不要解释，不要加代码块，不要加多余文字。

返回格式：
{
  "translation": "中文翻译（必须是中文）",
  "keywords": "英文关键词1, 英文关键词2",
  "example": "一个自然、简单、正确的英文例句（必须是英文，不能是中文，不能中英混合）"
}

要求：
1. translation 必须是中文
2. keywords 必须只输出 2 个英文关键词
3. keywords 必须优先提取句子里最值得学习、最值得记忆的英文表达块或短语
4. 不要优先提取过于基础、过于零散的单个单词
5. keywords 应该尽量选择可复用、自然、常见的表达
6. example 必须是完整英文句子
7. example 绝对不能是中文
8. example 绝对不能中英混合
9. 不要输出解释
10. 不要输出代码块
11. 不要输出 JSON 之外的任何文字`,
            },
          ],
        }),
      }
    );

    const result = await response.json();

    let content = result?.choices?.[0]?.message?.content || "";

    // 去掉可能的 ```json 包裹
    content = content.replace(/```json/g, "").replace(/```/g, "").trim();

    // 截取最外层 JSON
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");

    if (start !== -1 && end !== -1 && end > start) {
      content = content.slice(start, end + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      return Response.json({
        translation: content,
        keywords: "",
        example: "",
      });
    }

    return Response.json({
      translation: parsed.translation || "",
      keywords: parsed.keywords || "",
      example: parsed.example || "",
    });
  } catch (error) {
    console.error("接口错误:", error);
    return Response.json(
      { error: "AI generation failed" },
      { status: 500 }
    );
  }
}