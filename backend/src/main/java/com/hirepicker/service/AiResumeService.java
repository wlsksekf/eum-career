package com.hirepicker.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.genai.Client;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.Part;
import com.hirepicker.dto.ai.FullResumeDraftDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

// AI 이력서 초안 생성을 담당하는 서비스
@Service
@Slf4j
public class AiResumeService {

    private final Client client;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    // 스프링 빈으로 등록된 Client(API key가 주입 완료된 인스턴스)를 주입받아 사용합니다.
    public AiResumeService(Client client) {
        this.client = client;
    }

    /**
     * 사용자 데이터와 채용 공고를 기반으로 완전한 이력서 초안을 생성하거나 기존 초안을 수정합니다.
     * @param userData 사용자 정보
     * @param jobPostingData 채용 공고 정보
     * @param resumeDraft (선택) 수정할 기존 이력서 초안
     * @return 생성 또는 수정된 FullResumeDraftDto 객체
     */
    public FullResumeDraftDto generateFullResumeDraft(String userData, String jobPostingData, FullResumeDraftDto resumeDraft) {
        try {
            // 1. 현재 요청의 모드를 정의한다.
            boolean isRefining = (resumeDraft != null);
            boolean isSpecific = (jobPostingData != null && !jobPostingData.isBlank());

            // 2. 모드에 따라 시스템 프롬프트와 사용자 프롬프트를 동적으로 생성한다.
            String systemPrompt;
            String userPrompt;

            // 기본 안내 문구: 결과를 4개의 JSON 항목으로 돌려달라고 명시
            String baseInstruction = "당신은 대한민국 최고의 커리어 컨설턴트입니다. 결과는 반드시 4개 항목(growthProcess, jobCompetencies, prosAndCons, aspirations)을 모두 포함한 JSON 형식으로 반환해야 하며, 각 항목은 200자에서 400자 사이로 작성해야 합니다. ";
            String jobInfo = isSpecific ? jobPostingData : "(특별한 채용 공고 정보나 요청사항 없음)";

            if (isRefining) { // 수정 모드
                if (resumeDraft == null) {
                    // This should not happen due to the isRefining check, but as a safeguard
                    throw new IllegalStateException("resumeDraft cannot be null in refining mode.");
                }
                if (isSpecific) { // 특정 회사 대상 수정
                    systemPrompt = baseInstruction + "주어진 사용자 정보, 채용 공고, 그리고 기존 초안을 바탕으로, 초안의 내용은 유지하면서 채용 공고에 맞게 내용을 더욱 프로페셔널하고 설득력 있게 다듬어 주세요. 비어있는 항목은 채용 공고와 사용자 정보를 바탕으로 새로 작성해주세요.";
                } else { // 범용 수정
                    systemPrompt = baseInstruction + "주어진 사용자 정보와 기존 초안을 바탕으로, 특정 회사를 언급하지 말고, 초안의 내용은 유지하면서 범용적으로 사용할 수 있도록 내용을 더욱 프로페셔널하게 다듬어 주세요. 비어있는 항목은 사용자 정보를 바탕으로 새로 작성해주세요.";
                }

                // 사용자 프롬프트 구성 (다듬을/새로 쓸 항목 구분)
                StringBuilder toRefine = new StringBuilder();
                StringBuilder toGenerate = new StringBuilder();
                Map<String, String> drafts = new LinkedHashMap<>();
                drafts.put("성장과정", resumeDraft.growthProcess());
                drafts.put("업무 관련 역량", resumeDraft.jobCompetencies());
                drafts.put("성격 장단점", resumeDraft.prosAndCons());
                drafts.put("입사 후 포부", resumeDraft.aspirations());

                drafts.forEach((key, value) -> {
                    if (value != null && !value.isBlank()) {
                        toRefine.append(String.format("- %s: %s\n", key, value));
                    } else {
                        toGenerate.append(String.format("- %s\n", key));
                    }
                });

                userPrompt = "## 사용자 정보\n" + userData + "\n\n" + "## 채용 공고/요청사항\n" + jobInfo;
                if (toRefine.length() > 0) {
                    userPrompt += "\n\n### 다음 항목은 내용을 더 멋지게 다듬어주세요:\n" + toRefine.toString();
                }
                if (toGenerate.length() > 0) {
                    userPrompt += "\n\n### 다음 항목은 새로 작성해주세요:\n" + toGenerate.toString();
                }

            } else { // 신규 생성 모드
                if (isSpecific) { // 특정 회사 대상 신규 생성
                    systemPrompt = baseInstruction + "주어진 사용자 정보와 채용 공고를 바탕으로, 지원자의 역량이 해당 회사와 직무에 어떻게 기여할 수 있는지 구체적으로 연결하여 자기소개서를 작성해주세요.";
                } else { // 범용 신규 생성
                    systemPrompt = baseInstruction + "채용 공고 정보가 없으니, 주어진 사용자 정보를 바탕으로, 특정 회사를 언급하지 않고 어떤 회사든 매력적으로 보일 수 있는 범용적인 지원동기를 포함한 자기소개서를 작성해주세요. 기술에 대한 열정, 성장 욕구, 협업 능력을 강조해주세요.";
                }
                userPrompt = "## 사용자 정보\n" + userData + "\n\n" + "## 채용 공고/요청사항\n" + jobInfo;
            }

            // 3. AI 모델 설정 및 호출: systemPrompt를 system instruction으로 등록한 뒤 Gemini 모델을 실행한다.
            GenerateContentConfig config = GenerateContentConfig.builder()
                    .systemInstruction(Content.fromParts(Part.fromText(systemPrompt)))
                    .build();

            GenerateContentResponse response = client.models.generateContent("gemini-2.5-flash", userPrompt, config);

            // 4. AI 응답 파싱 및 반환
            String responseText = response.text();
            int startIndex = responseText.indexOf('{');
            int endIndex = responseText.lastIndexOf('}');

            if (startIndex == -1 || endIndex == -1 || endIndex < startIndex) {
                log.error("AI로부터 유효한 JSON 응답을 받지 못했습니다. 응답 내용: {}", responseText);
                throw new RuntimeException("AI로부터 유효한 JSON 응답을 받지 못했습니다.");
            }

            String jsonString = responseText.substring(startIndex, endIndex + 1);
            JsonNode rootNode;
            try {
                rootNode = OBJECT_MAPPER.readTree(jsonString);
            } catch (IOException e) {
                log.error("AI 응답 JSON 파싱 실패: {}", jsonString, e);
                throw new RuntimeException("AI 응답 JSON 파싱에 실패했습니다.", e);
            }

            // 키 불일치 대비: DB 컬럼명 기반 키와 기존 키를 모두 허용한다.
            String growth = getFirstNonBlank(rootNode,
                    "background_and_growth", "growthProcess", "growth_process", "growth");
            String competencies = getFirstNonBlank(rootNode,
                    "jobCompetencies", "job_competencies", "personality", "strengths", "skills");
            String prosCons = getFirstNonBlank(rootNode,
                    "prosAndCons", "prosCons", "pros_cons", "pros_and_cons",
                    "strengthsAndWeaknesses", "strengths_and_weaknesses",
                    "advantages_disadvantages", "strengths_weaknesses", "personality_analysis");
            if (prosCons == null || prosCons.isBlank()) {
                prosCons = buildProsConsFallback(growth, competencies, resumeDraft);
            }
            String future = getFirstNonBlank(rootNode,
                    "future_aspirations", "aspirations", "futurePlan", "future_plan", "plan");

            return new FullResumeDraftDto(
                    growth,
                    competencies,
                    prosCons,
                    future
            );
        } catch (Throwable t) {
            log.error("!!! AiResumeService에서 예측하지 못한 에러 발생 !!!", t);
            throw new RuntimeException("AI 이력서 생성 중 예측하지 못한 에러가 발생했습니다.", t);
        }
    }

    // 장단점이 누락된 경우, 이미 생성한 다른 항목을 조합해 하나의 자연스러운 문단으로 만든다.
    private String buildProsConsFallback(String growth, String competencies, FullResumeDraftDto resumeDraft) {
        StringBuilder sb = new StringBuilder();
        appendSentence(sb, resumeDraft != null ? resumeDraft.jobCompetencies() : null);
        appendSentence(sb, resumeDraft != null ? resumeDraft.growthProcess() : null);
        appendSentence(sb, competencies);
        appendSentence(sb, growth);

        String text = sb.toString().trim();
        if (text.isEmpty()) {
            return "다양한 프로젝트 경험을 통해 강점을 발전시키고 부족한 부분은 꾸준히 개선하고 있습니다.";
        }
        return text;
    }

    // 문자열이 null/빈칸이 아닌 경우만 공백으로 이어 붙인다.
    private void appendSentence(StringBuilder sb, String value) {
        if (value == null) return;
        String trimmed = value.trim();
        if (trimmed.isEmpty()) return;
        if (sb.length() > 0) {
            sb.append(' ');
        }
        sb.append(trimmed);
    }

    public FullResumeDraftDto generateFullDraft(String keywords, Long userId) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'generateFullDraft'");
    }

    // JSON에서 다수 후보 키 중 첫 번째로 존재하고 공백이 아닌 값을 반환하는 헬퍼
    private static String getFirstNonBlank(JsonNode node, String... keys) {
        for (String k : keys) {
            String value = findValue(node, k);
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return ""; // 모든 후보가 없으면 빈 문자열 반환
    }

    // 트리를 순회하면서 해당 키를 찾고 값을 문자열로 돌려준다.
    private static String findValue(JsonNode node, String targetKey) {
        if (node == null || targetKey == null || node.isMissingNode()) return null;
        if (node.isObject()) {
            java.util.Iterator<String> fieldNames = node.fieldNames();
            while (fieldNames.hasNext()) {
                String key = fieldNames.next();
                JsonNode child = node.get(key);
                if (keyMatches(key, targetKey)) {
                    String text = nodeToText(child);
                    if (!text.isBlank()) return text;
                }
                String nested = findValue(child, targetKey);
                if (nested != null && !nested.isBlank()) return nested;
            }
        } else if (node.isArray()) {
            for (JsonNode child : node) {
                String nested = findValue(child, targetKey);
                if (nested != null && !nested.isBlank()) return nested;
            }
        }
        return null;
    }

    // 키 비교 시 대소문자/언더스코어 등을 무시하기 위한 비교 함수
    private static boolean keyMatches(String actual, String expected) {
        if (actual == null || expected == null) return false;
        if (actual.equalsIgnoreCase(expected)) return true;
        return normalizeKey(actual).equals(normalizeKey(expected));
    }

    // 키 정규화: 언더스코어/하이픈 등을 제거하고 lower-case로 맞춘다.
    private static String normalizeKey(String key) {
        return key == null ? "" : key.toLowerCase().replaceAll("[_\\-\\s]", "");
    }

    // JsonNode를 문자열로 안전하게 변환 (null -> 빈 문자열)
    private static String nodeToText(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return "";
        if (node.isValueNode() || node.isPojo()) {
            String text = node.asText("");
            return "null".equalsIgnoreCase(text) ? "" : text.trim();
        }
        String text = node.toString();
        if (text == null) return "";
        text = text.trim();
        return "null".equalsIgnoreCase(text) ? "" : text;
    }
}
