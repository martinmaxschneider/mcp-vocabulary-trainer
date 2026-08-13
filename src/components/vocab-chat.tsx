"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { api } from "~/trpc/client";
import { SOURCE_LANG } from "~/lib/languages";

interface VocabChatProps {
  sourceWord: string;
  translation: string;
  targetLang: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function VocabChat({ sourceWord, translation, targetLang }: VocabChatProps) {
  const t = useTranslations("vocabChat");
  const tCommon = useTranslations("common");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const chatMutation = api.assist.vocabChat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer },
      ]);
    },
  });

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");

    chatMutation.mutate({
      sourceWord,
      sourceLang: SOURCE_LANG.code,
      translation,
      targetLang,
      userQuestion: userMessage,
      conversationHistory: messages,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <div className="mt-4 flex justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          {t("askQuestion")}
        </Button>
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircle className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            {tCommon("close")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("wordArrow", { source: sourceWord, translation })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {messages.length > 0 && (
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-[#eef4fa]"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                </div>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-[#eef4fa] px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder={t("inputPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={chatMutation.isPending}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            size="icon"
          >
            {chatMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setInput(t("quickExampleSentencesPrompt"));
              }}
            >
              {t("quickExampleSentences")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setInput(t("quickSimilarWordsPrompt"));
              }}
            >
              {t("quickSimilarWords")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setInput(t("quickUsagePrompt"));
              }}
            >
              {t("quickUsage")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
