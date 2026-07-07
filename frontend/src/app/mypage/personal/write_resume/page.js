"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ResumeForm from "@/components/ResumeForm";
import { pdf } from "@react-pdf/renderer"; // [로컬 테스트] 동적 PDF 변환용
import ResumePdfDocument from "@/components/ResumePdfDocument"; // [로컬 테스트] PDF 템플릿
import {
  api,
  getResumeTemplate,
  createResume,
  saveResumeCertifications,
  searchSchools as apiSearchSchools,
  generateAiFullDraft,
  generateAiResumeDraft,
  getCertifications,
  getResumeDetail,
  updateResume,
  saveExperiences,
  getCreditBalance,
} from "@/api";
import { createEmptyResumeForm } from "@/constants/resumeFormDefaults";
import { Box, CircularProgress } from "@mui/material";

function pad2(value = "") {
  return value.toString().padStart(2, "0");
}

function resolveProsCons(rawProsCons, jobCompetencies, growthProcess) {
  const trimmed = typeof rawProsCons === 'string' ? rawProsCons.trim() : "";
  if (trimmed) return trimmed;
  const fallbackParts = [jobCompetencies, growthProcess].filter(Boolean).map((v) => v.trim()).filter(Boolean);
  if (fallbackParts.length > 0) {
    return fallbackParts.join("\n\n");
  }
  return "상황에 맞춰 강점을 살리고 부족한 부분은 지속해서 개선하겠습니다.";
}

function normalizeIsoDate(dateStr) {
  if (!dateStr) return "";
  const trimmed = String(dateStr).trim();
  if (!trimmed) return "";
  const sanitized = trimmed.replace(/\./g, "-");
  const match = sanitized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function formatDisplayDate(dateStr) {
  const iso = normalizeIsoDate(dateStr);
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${year}.${month}.${day}`;
}

function formatDisplayPeriod(startDate, endDate) {
  const start = formatDisplayDate(startDate);
  const end = formatDisplayDate(endDate);
  if (!start && !end) return "";
  if (!start) return `~ ${end}`;
  if (!end) return `${start} ~`;
  return `${start} ~ ${end}`;
}

function normalizeGenderDisplay(rawGender) {
  if (rawGender === undefined || rawGender === null) return "";
  const trimmed = String(rawGender).trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (upper === "MALE" || upper === "M") return "남성";
  if (upper === "FEMALE" || upper === "F") return "여성";
  if (trimmed === "남" || trimmed === "남자") return "남성";
  if (trimmed === "여" || trimmed === "여자") return "여성";
  return trimmed;
}

const HIGH_SCHOOL_DEGREE = "고졸";
const AI_CREDIT_COST = 500; // AI 생성 시 차감될 고정 크레딧
function isHighSchoolDegree(degree = "") {
  return degree === HIGH_SCHOOL_DEGREE;
}
function hasHighSchoolKeyword(text = "") {
  if (!text) return false;
  return text.includes("고등학교") || text.includes("고등") || text.includes("여고") || text.includes("상고");
}
function isHighSchoolType(type = "") {
  return typeof type === "string" && type.includes("고등");
}
function isHighSchoolAcademic(item = {}) {
  const degree = item?.degree ?? item?.Degree ?? "";
  if (isHighSchoolDegree(degree)) return true;
  const schoolType = item?.schoolType ?? item?.school_type ?? "";
  if (isHighSchoolType(schoolType)) return true;
  const schoolName = item?.schoolName ?? item?.school_name ?? "";
  return hasHighSchoolKeyword(schoolName);
}

function resolveComparableTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const normalized = normalizeIsoDate(value);
  if (normalized) {
    const parsed = Date.parse(normalized);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function sortAcademicsDesc(list = []) {
  return [...list].sort((a, b) => {
    const aIsHighSchool = isHighSchoolAcademic(a);
    const bIsHighSchool = isHighSchoolAcademic(b);
    if (aIsHighSchool !== bIsHighSchool) {
      return aIsHighSchool ? 1 : -1; // 고등학교는 하단으로 배치
    }

    const gradA =
      resolveComparableTime(a?.graduationDate ?? a?.graduation_date) ??
      resolveComparableTime(a?.admissionDate ?? a?.admission_date);
    const gradB =
      resolveComparableTime(b?.graduationDate ?? b?.graduation_date) ??
      resolveComparableTime(b?.admissionDate ?? b?.admission_date);

    if (gradA === null && gradB === null) return 0;
    if (gradA === null) return 1;
    if (gradB === null) return -1;
    if (gradA === gradB) return 0;
    return gradB - gradA;
  });
}

function normalizeDateInput(input) {
  if (input === undefined || input === null) return "";
  const trimmed = String(input).trim();
  if (!trimmed) return "";
  const sanitized = trimmed.replace(/\s+/g, "").replace(/\./g, "-");
  const match = sanitized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parsePeriodInput(value = "") {
  const [startRaw = "", endRaw = ""] = value.split("~");
  const start = normalizeDateInput(startRaw);
  const end = normalizeDateInput(endRaw);
  return { start, end };
}

function parseCertSummary(summary) {
  if (!summary) return [];
  return summary
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.*?)(?:\((.*?)\))?$/);
      if (match) {
        return {
          name: match[1].trim(),
          score: match[2] ? match[2].trim() : "",
        };
      }
      return { name: entry, score: "" };
    });
}

function mapDetailToForm(detail) {
  const next = createEmptyResumeForm();

  next.title = detail?.title || "";
  next.selfGrowth = detail?.selfGrowth || "";
  next.selfStrengths = detail?.selfStrengths || "";
  next.selfMotivation = detail?.selfMotivation || "";
  next.selfAspirations = detail?.selfAspirations || "";
  next.cert = detail?.cert || "";
  next.creditCost = typeof detail?.creditCost === 'number' ? detail.creditCost : Number(detail?.credit_cost ?? 0) || 0;
  next.resumeStatus = detail?.status || "PRIVATE";

  const personal = detail?.personal || {};
  next.name = personal.name || "";
  next.gender = normalizeGenderDisplay(personal.gender);
  next.phone = personal.phone || personal.phoneNumber || "";
  next.email = personal.email || "";
  next.address = personal.address || "";
  next.birthdate =
    normalizeIsoDate(personal.birthdate || personal.birthDate) || "";

  const academics = Array.isArray(detail?.academics) ? detail.academics : [];
  sortAcademicsDesc(academics).slice(0, 2).forEach((item, index) => {
    const idx = index + 1;
    next[`edu${idx}_school`] = item.schoolName || "";
    next[`edu${idx}_major`] = item.major || "";
    next[`edu${idx}_status`] = item.degree || "";
    next[`edu${idx}_score`] = item.majorScore != null ? String(item.majorScore) : "";
    next[`edu${idx}_admission`] = normalizeIsoDate(item.admissionDate);
    next[`edu${idx}_graduation`] = normalizeIsoDate(item.graduationDate);
    next[`edu${idx}_period`] = formatDisplayPeriod(item.admissionDate, item.graduationDate);
  });

  const experiences = Array.isArray(detail?.experiences) ? detail.experiences : [];
  experiences.slice(0, 2).forEach((item, index) => {
    const idx = index + 1;
    next[`exp${idx}_company`] = item.companyName || "";
    next[`exp${idx}_position`] = item.position || "";
    next[`exp${idx}_duties`] = item.mainDuties || item.jobDescription || "";
    next[`exp${idx}_type`] = item.department || "";
    next[`exp${idx}_period`] = formatDisplayPeriod(item.hireDate, item.resignDate);
    next[`exp${idx}_hire`] = normalizeIsoDate(item.hireDate);
    next[`exp${idx}_resign`] = normalizeIsoDate(item.resignDate);
  });

  const military = detail?.military || null;
  if (military) {
    next.military_status = military.serviceType || "";
    next.military_branch = military.militaryBranch || "";
    next.military_rank = military.militaryRank || "";
    next.military_enlistment = normalizeIsoDate(military.enlistmentDate);
    next.military_discharge = normalizeIsoDate(military.dischargeDate);
    next.military_reason = military.reasonForExemption || "";
    next.military_period = formatDisplayPeriod(military.enlistmentDate, military.dischargeDate);
  }

  const certs = parseCertSummary(detail?.cert);
  certs.slice(0, 3).forEach((item, index) => {
    const idx = index + 1;
    next[`cert${idx}_name`] = item.name;
    next[`cert${idx}_score`] = item.score;
  });

  return next;
}

function buildExperiencePayload(form) {
  const items = [];
  for (let index = 1; index <= 2; index += 1) {
    const companyName = form[`exp${index}_company`]?.trim() || "";
    const hireDate = normalizeIsoDate(form[`exp${index}_hire`]);
    const resignDate = normalizeIsoDate(form[`exp${index}_resign`]);
    const position = form[`exp${index}_position`]?.trim() || "";
    const department = form[`exp${index}_type`]?.trim() || "";
    const duties = form[`exp${index}_duties`]?.trim() || "";

    if (!companyName && !hireDate) {
      continue;
    }

    items.push({
      companyName,
      department: department || null,
      position: position || null,
      hireDate: hireDate || null,
      resignDate: resignDate || null,
      jobDescription: duties || null,
      mainDuties: duties || null,
    });
  }
  return items;
}

export default function WriteResumePage(props = {}) {
  const router = useRouter();
  const rawResumeId = props?.resumeId ?? props?.params?.id ?? null;
  const resumeId = rawResumeId ? Number(rawResumeId) : null;
  const isEditing = Boolean(resumeId);

  const [formData, setFormData] = useState(() => createEmptyResumeForm());
  const [isLoading, setIsLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [initialImageUrl, setInitialImageUrl] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [userId, setUserId] = useState(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [availableExperiences, setAvailableExperiences] = useState([]); // 선택 가능한 경력 목록
  const [availableCertifications, setAvailableCertifications] = useState([]); // 선택 가능한 자격증 목록
  const [initializing, setInitializing] = useState(true);
  const [creditBalance, setCreditBalance] = useState(null); // AI 사용을 위한 현재 크레딧 잔액

  // 현재 크레딧 잔액을 최신화하는 헬퍼
  const fetchCreditBalance = useCallback(async () => {
    try {
      const balance = await getCreditBalance();
      setCreditBalance(balance);
      return balance;
    } catch (err) {
      console.error("크레딧 잔액 조회 실패:", err);
      setCreditBalance(0);
      return 0;
    }
  }, []);

  // AI 사용 전 크레딧 잔액 확인 및 안내
  const ensureAiCredits = useCallback(async () => {
    const currentRaw = creditBalance != null ? creditBalance : await fetchCreditBalance();
    const current = Number.isFinite(currentRaw) ? currentRaw : 0;
    if (current < AI_CREDIT_COST) {
      alert(`AI 이력서를 작성하려면 ${AI_CREDIT_COST}크레딧이 필요합니다.\n현재 보유 크레딧: ${current}C`);
      return false;
    }
    const confirmed = window.confirm(`AI 자기소개서 작성 시 ${AI_CREDIT_COST}크레딧이 차감됩니다. 계속 진행할까요?`);
    return confirmed;
  }, [creditBalance, fetchCreditBalance]);

  // init: load user and template
  useEffect(() => {
    api.get('/api/users/me')
      .then(res => {
        const u = res.data || {};
        const detectedUserId = u?.p_user_idx ?? u?.pUserIdx ?? u?.id ?? null;
        setUserId(detectedUserId);
        const normalizedGender = normalizeGenderDisplay(u.gender);
        const normalizedBirthdate = normalizeIsoDate(
          u.birthdate ?? u.birthDate ?? ""
        );
        setFormData(prev => ({
          ...prev,
          name: u.name || '',
          gender: normalizedGender,
          birthdate: normalizedBirthdate,
          phone: u.phoneNumber || '',
          email: u.email || '',
          address: u.address || ''
        }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCreditBalance();
  }, [fetchCreditBalance]);

  useEffect(() => {
    if (resumeId) {
      loadResumeDetail(resumeId);
    } else {
      loadResumeTemplate(true);
    }
  }, [resumeId]);

  // 이력서 템플릿 데이터 로드 및 자동 채우기
  async function loadResumeTemplate(triggerInitializing = false, mergeIntoForm = true) {
    if (triggerInitializing) setInitializing(true);
    try {
      const template = await getResumeTemplate();
      if (!template) return;

      const updates = {};

      // 학력 자동 채우기 (최대 2개)
      const templateAcademics = sortAcademicsDesc(
        Array.isArray(template?.academics) ? template.academics : []
      );
      if (templateAcademics.length > 0) {
        const acad1 = templateAcademics[0];
        if (acad1) {
          updates.edu1_school = acad1.schoolName || '';
          updates.edu1_schoolCode = acad1.schoolCode || null;
          updates.edu1_major = acad1.major || '';
          updates.edu1_score = acad1.majorScore ? String(acad1.majorScore) : '';
          updates.edu1_status = acad1.degree || '';
          updates.edu1_admission = normalizeIsoDate(acad1.admissionDate);
          updates.edu1_graduation = normalizeIsoDate(acad1.graduationDate);
          updates.edu1_period = formatDisplayPeriod(acad1.admissionDate, acad1.graduationDate);
        }
        if (templateAcademics.length > 1) {
          const acad2 = templateAcademics[1];
          if (acad2) {
            updates.edu2_school = acad2.schoolName || '';
            updates.edu2_schoolCode = acad2.schoolCode || null;
            updates.edu2_major = acad2.major || '';
            updates.edu2_score = acad2.majorScore ? String(acad2.majorScore) : '';
            updates.edu2_status = acad2.degree || '';
            updates.edu2_admission = normalizeIsoDate(acad2.admissionDate);
            updates.edu2_graduation = normalizeIsoDate(acad2.graduationDate);
            updates.edu2_period = formatDisplayPeriod(acad2.admissionDate, acad2.graduationDate);
          }
        }
      }

      if (template.personal) {
        const templateGender = normalizeGenderDisplay(template.personal.gender);
        if (templateGender) {
          updates.gender = templateGender;
        }
        const templateBirthdate = normalizeIsoDate(
          template.personal.birthdate ?? template.personal.birthDate ?? ""
        );
        if (templateBirthdate) {
          updates.birthdate = templateBirthdate;
        }
      }

      // 병역 자동 채우기
      if (template.military) {
        updates.military_status = template.military.serviceType || '';
        updates.military_branch = template.military.militaryBranch || '';
        updates.military_rank = template.military.militaryRank || '';
        updates.military_enlistment = normalizeIsoDate(template.military.enlistmentDate);
        updates.military_discharge = normalizeIsoDate(template.military.dischargeDate);
        updates.military_period = formatDisplayPeriod(template.military.enlistmentDate, template.military.dischargeDate);
        updates.military_reason = template.military.reasonForExemption || '';
      }

      // 경력과 자격증은 선택 가능하도록 목록만 저장 (자동 채우지 않음)
      // 사용자가 선택할 수 있도록 별도 상태로 관리
      setAvailableExperiences(template.experiences || []);
      
      // 자격증 목록 조회
      try {
        const certs = await getCertifications();
        setAvailableCertifications(certs || []);
      } catch (err) {
        console.error('자격증 목록 조회 실패:', err);
        setAvailableCertifications([]);
      }
      
      if (mergeIntoForm) {
        setFormData(prev => ({ ...prev, ...updates }));
      }
    } catch (err) {
      console.error('템플릿 로드 실패:', err);
    } finally {
      if (triggerInitializing) setInitializing(false);
    }
  }

  async function loadResumeDetail(targetResumeId) {
    setInitializing(true);
    try {
      const detail = await getResumeDetail(targetResumeId);
      if (!detail) {
        throw new Error("이력서 상세 정보를 찾을 수 없습니다.");
      }
      const mapped = mapDetailToForm(detail);
      setFormData(mapped);
      const imageUrl = detail.imageUrl || detail.img || null;
      setPreviewImage(imageUrl);
      setInitialImageUrl(imageUrl);
      setImageFile(null);

      await loadResumeTemplate(false, false);
    } catch (err) {
      console.error("이력서 상세 로드 실패:", err);
    } finally {
      setInitializing(false);
    }
  }

  const [schoolOptions1, setSchoolOptions1] = useState([]);
  const [schoolOptions2, setSchoolOptions2] = useState([]);
  const [schoolLoading1, setSchoolLoading1] = useState(false);
  const [schoolLoading2, setSchoolLoading2] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    const periodMap = {
      edu1_period: ['edu1_admission', 'edu1_graduation'],
      edu2_period: ['edu2_admission', 'edu2_graduation'],
      military_period: ['military_enlistment', 'military_discharge'],
      exp1_period: ['exp1_hire', 'exp1_resign'],
      exp2_period: ['exp2_hire', 'exp2_resign'],
    };

    if (periodMap[name]) {
      const [startKey, endKey] = periodMap[name];
      const { start, end } = parsePeriodInput(value);
      const next = { [name]: value };
      next[startKey] = start ?? '';
      next[endKey] = end ?? '';

      const includesOngoing = typeof value === 'string' && value.includes('재직');
      const startLabel = start ? formatDisplayDate(start) : '';
      const endLabel = end
        ? formatDisplayDate(end)
        : (includesOngoing ? '재직중' : '');

      if (startLabel || endLabel) {
        next[name] = endLabel
          ? `${startLabel}${startLabel ? ' ~ ' : ''}${endLabel}`
          : startLabel;
      } else if (!value) {
        next[name] = '';
      }

      setFormData((prev) => ({
        ...prev,
        ...next,
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const onImageChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (isEditing) {
      alert("현재는 이력서 프로필 이미지를 수정할 수 없습니다.");
      return;
    }
    setImageFile(file);
    setPreviewImage(URL.createObjectURL(file));
  };

  const searchSchools = async (query, target = 1) => {
    if (!query || query.trim().length < 2) {
      if (target === 1) setSchoolOptions1([]); else setSchoolOptions2([]);
      return;
    }
    try {
      if (target === 1) setSchoolLoading1(true); else setSchoolLoading2(true);
      const list = await apiSearchSchools(query.trim());
      if (target === 1) setSchoolOptions1(list || []);
      else setSchoolOptions2(list || []);
    } finally {
      if (target === 1) setSchoolLoading1(false); else setSchoolLoading2(false);
    }
  };

  // AI dialog handlers
  const onOpenAiDialog = () => setAiDialogOpen(true);
  const onDialogClose = () => setAiDialogOpen(false);

  const onSchoolSelect = (prefix, option) => {
    if (!option) return;
    setFormData((prev) => ({
      ...prev,
      [`${prefix}_school`]: option.schoolName,
      [`${prefix}_schoolCode`]: option.schoolCode,
    }));
  };

  // 경력 선택 핸들러
  const onExperienceSelect = (expIndex, experience) => {
    if (!experience) {
      // 선택 해제
      setFormData((prev) => ({
        ...prev,
        [`exp${expIndex}_company`]: '',
        [`exp${expIndex}_position`]: '',
        [`exp${expIndex}_duties`]: '',
        [`exp${expIndex}_period`]: '',
        [`exp${expIndex}_type`]: '',
        [`exp${expIndex}_hire`]: '',
        [`exp${expIndex}_resign`]: '',
      }));
      return;
    }

    // 날짜 포맷팅 헬퍼
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    };

    const period = experience.hireDate 
      ? `${formatDate(experience.hireDate)} ~ ${experience.resignDate ? formatDate(experience.resignDate) : '재직중'}`
      : '';

    setFormData((prev) => ({
      ...prev,
      [`exp${expIndex}_company`]: experience.companyName || '',
      [`exp${expIndex}_position`]: experience.position || '',
      [`exp${expIndex}_duties`]: experience.mainDuties || experience.jobDescription || '',
      [`exp${expIndex}_period`]: period,
      [`exp${expIndex}_type`]: experience.department || '',
      [`exp${expIndex}_hire`]: experience.hireDate ? normalizeIsoDate(experience.hireDate) : '',
      [`exp${expIndex}_resign`]: experience.resignDate ? normalizeIsoDate(experience.resignDate) : '',
    }));
  };

  // 자격증 선택 핸들러
  const onCertificationSelect = (certIndex, certification) => {
    if (!certification) {
      // 선택 해제
      setFormData((prev) => ({
        ...prev,
        [`cert${certIndex}_name`]: '',
        [`cert${certIndex}_score`]: '',
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [`cert${certIndex}_name`]: certification.certName || '',
      [`cert${certIndex}_score`]: certification.score || '',
    }));
  };

  // AI draft generate
  const onAiGenerate = async (arg, options = {}) => {
    let prompt = typeof arg === 'string' ? arg.trim() : (formData.aiPrompt || '').trim();
    if (!prompt) {
      prompt = [
        formData.title,
        formData.selfGrowth,
        formData.selfStrengths,
        formData.selfMotivation,
        formData.selfAspirations,
      ].filter(Boolean).join('\n');
    }
    if (!prompt) { alert('AI 요청 문구를 입력해주세요.'); return; }

    const skipCreditCheck = Boolean(options.skipCreditCheck);
    if (!skipCreditCheck) {
      const canProceed = await ensureAiCredits();
      if (!canProceed) return;
    }

    setIsLoading(true);
    try {
      const res = await generateAiFullDraft(prompt);
      const { growthProcess, jobCompetencies, prosAndCons, aspirations } = res.data || {};
      const resolvedProsCons = resolveProsCons(prosAndCons, jobCompetencies, growthProcess);
      setFormData(prev => ({
        ...prev,
        selfGrowth: growthProcess || prev.selfGrowth || '',
        selfStrengths: resolvedProsCons || prev.selfStrengths || '',
        selfMotivation: jobCompetencies || prev.selfMotivation || '',
        selfAspirations: aspirations || prev.selfAspirations || '',
      }));
      const remaining = Number(res?.headers?.["x-remaining-credits"]);
      // 서버 응답 헤더가 있으면 그대로 잔액을 반영
      if (!Number.isNaN(remaining)) {
        setCreditBalance(remaining);
      } else {
        // 헤더가 없으면 클라이언트에서 사용분만큼 차감
        setCreditBalance(prev => (prev != null ? Math.max(0, prev - AI_CREDIT_COST) : prev));
      }
    } catch (error) {
      console.error("AI 초안 생성 실패:", error);
      // 서버에서 전달된 오류 메시지를 우선 노출
      const message = error?.response?.data?.message || error?.message || 'AI 초안 생성 중 오류가 발생했습니다.';
      alert(message);
      if (error?.response?.status === 402) {
        // 크레딧 부족 응답 시 잔액을 재조회해 정확도를 유지
        await fetchCreditBalance();
      }
      return;
    } finally { setIsLoading(false); }
  };

  // refine
  const onRefine = async () => {
    const userData = (formData.aiPrompt || formData.title || '').trim();
    if (!userData) { alert('AI 요청 문구를 입력해주세요.'); return; }
    const canProceed = await ensureAiCredits();
    if (!canProceed) {
      return;
    }
    setAiDialogOpen(false);
    setIsLoading(true);
    try {
      const resumeDraft = {
        growthProcess: formData.selfGrowth || '',
        jobCompetencies: formData.selfMotivation || '',
        prosAndCons: formData.selfStrengths || '',
        aspirations: formData.selfAspirations || '',
      };
      const res = await generateAiResumeDraft({ userData, resumeDraft });
      const { growthProcess, jobCompetencies, prosAndCons, aspirations } = res.data || {};
      const resolvedProsCons = resolveProsCons(prosAndCons, jobCompetencies, growthProcess);
      setFormData(prev => ({
        ...prev,
        selfGrowth: growthProcess || prev.selfGrowth || '',
        selfStrengths: resolvedProsCons || prev.selfStrengths || '',
        selfMotivation: jobCompetencies || prev.selfMotivation || '',
        selfAspirations: aspirations || prev.selfAspirations || '',
      }));
      const remaining = Number(res?.headers?.["x-remaining-credits"]);
      // 헤더 기반 잔액 갱신
      if (!Number.isNaN(remaining)) {
        setCreditBalance(remaining);
      } else {
        // 헤더 없으면 1회 사용량만큼 차감
        setCreditBalance(prev => (prev != null ? Math.max(0, prev - AI_CREDIT_COST) : prev));
      }
    } catch (error) {
      console.error("AI 초안 개선 실패:", error);
      // 사용자에게 명확한 오류 메시지 전달
      const message = error?.response?.data?.message || error?.message || 'AI 초안 개선 중 오류가 발생했습니다.';
      alert(message);
      if (error?.response?.status === 402) {
        await fetchCreditBalance();
      }
      return;
    } finally { setIsLoading(false); }
  };

  // start fresh
  const onStartFresh = async () => {
    const userData = (formData.aiPrompt || formData.title || '').trim();
    if (!userData) { alert('AI 요청 문구를 입력해주세요.'); return; }
    const canProceed = await ensureAiCredits();
    if (!canProceed) {
      return;
    }
    setAiDialogOpen(false);
    setFormData(prev => ({ ...prev, selfGrowth: '', selfStrengths: '', selfMotivation: '', selfAspirations: '' }));
    // 직전에 차감 여부를 확인했으므로 추가 확인은 생략
    await onAiGenerate(userData, { skipCreditCheck: true });
  };

  // save
  const onSave = async () => {
    if (!isEditing && !userId) { alert('로그인이 필요합니다.'); return; }
    setIsLoading(true);
    try {
      const experiencePayload = buildExperiencePayload(formData);
      const rawCertifications = [1, 2, 3]
        .map((index) => {
          const name = formData[`cert${index}_name`]?.trim();
          const score = formData[`cert${index}_score`]?.trim();
          if (!name) return null;
          return {
            certName: name,
            score: score || null,
          };
        })
        .filter(Boolean);

      const resumeCertSummary = rawCertifications.length === 0
        ? ''
        : rawCertifications
            .map(item => item.score ? `${item.certName} (${item.score})` : item.certName)
            .join(', ');

      const parsedCreditCost = Number(formData.creditCost);
      const creditCostValue = Number.isFinite(parsedCreditCost) ? Math.max(0, Math.floor(parsedCreditCost)) : 0;
      const resumeStatus = formData.resumeStatus === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';

      if (isEditing) {
        if (imageFile) {
          alert('이미지 변경은 아직 지원되지 않습니다. 기존 이미지를 유지합니다.');
        }

        const updatePayload = {
          title: formData.title || (formData.name ? `${formData.name} 이력서` : 'Resume'),
          selfGrowth: formData.selfGrowth || '',
          selfStrengths: formData.selfStrengths || '',
          selfMotivation: formData.selfMotivation || '',
          selfAspirations: formData.selfAspirations || '',
          imageUrl: initialImageUrl || null,
          creditCost: creditCostValue,
          status: resumeStatus,
          cert: resumeCertSummary,
          expIdx: null,
        };

        await updateResume(resumeId, updatePayload);
        await saveExperiences(experiencePayload);
        await saveResumeCertifications(resumeId, { certifications: rawCertifications });
        alert('이력서를 수정했습니다.');
        router.push(`/mypage/personal/resumes/${resumeId}`);
        return;
      }

      const resumeDto = {
        title: formData.title || (formData.name ? (formData.name + "'s Resume") : 'Resume'),
        selfGrowth: formData.selfGrowth || '',
        selfStrengths: formData.selfStrengths || '',
        selfMotivation: formData.selfMotivation || '',
        selfAspirations: formData.selfAspirations || '',
        imageUrl: null,
        cert: resumeCertSummary,
        credit_cost: creditCostValue,
        status: resumeStatus,
        expIdx: null,
        p_user_idx: userId,
        gender: formData.gender || undefined,
      };

      const created = await createResume(resumeDto, imageFile);
      const resumeIdx = created?.resumeId;

      if (resumeIdx) {
        await saveExperiences(experiencePayload);
        await saveResumeCertifications(resumeIdx, { certifications: rawCertifications });
        alert('이력서가 저장되었습니다.');
        router.push(`/mypage/personal/resumes/${resumeIdx}`);
      } else {
        alert('이력서가 저장되었습니다.');
      }
    } catch (e) {
      alert('이력서 저장에 실패했습니다.');
    } finally { setIsLoading(false); }
  };

  // [로컬 테스트] 작성중인 이력서 데이터를 기반으로 동적 PDF 빌딩 및 파일 다운로드 실행
  const onDownload = async () => {
    try {
      console.log('[PDF-Write] 동적 PDF 빌딩 시작...');
      const pdfData = {
        ...formData,
        imageUrl: previewImage // [로컬 테스트] previewImage를 PDF 렌더용 데이터에 병합
      };
      const doc = <ResumePdfDocument formData={pdfData} />;
      const asPdf = pdf(doc);
      const blob = await asPdf.toBlob();
      console.log('[PDF-Write] PDF 빌딩 완료. 크기:', blob.size, '바이트');
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${formData.name || '사용자'}_이력서.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[PDF-Write] 동적 PDF 다운로드 실패:', error);
      alert('PDF 생성 도중 오류가 발생했습니다.');
    }
  };

  if (initializing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '70vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <ResumeForm
      formData={formData}
      onChange={onChange}
      previewImage={previewImage}
      onImageChange={onImageChange}
      isLoading={isLoading}
      aiCreditCost={AI_CREDIT_COST}
      creditBalance={creditBalance}
      isAiCreditInsufficient={creditBalance != null && creditBalance < AI_CREDIT_COST}
      onAiGenerate={onAiGenerate}
      onOpenAiDialog={onOpenAiDialog}
      onDownload={onDownload} // [로컬 테스트] 완성된 동적 PDF 다운로드 기능 주입
      onSave={onSave}
      onRefine={onRefine}
      onStartFresh={onStartFresh}
      dialogOpen={aiDialogOpen}
      onDialogClose={onDialogClose}
      confirmDialogOpen={false}
      onConfirmDialogClose={() => {}}
      onConfirmStartFresh={() => {}}
      searchSchools={searchSchools}
      onSchoolSelect={onSchoolSelect}
      schoolOptions1={schoolOptions1}
      schoolLoading1={schoolLoading1}
      schoolOptions2={schoolOptions2}
      schoolLoading2={schoolLoading2}
      availableExperiences={availableExperiences}
      availableCertifications={availableCertifications}
      onExperienceSelect={onExperienceSelect}
      onCertificationSelect={onCertificationSelect}
    />
  );
}

