// frontend/src/components/ResumePdfDocument.js (수정됨)
'use client';

import React from "react";
import { Page, Text, View, Document, StyleSheet, Font, Image } from "@react-pdf/renderer";
// [로컬 테스트] 클라이언트 마운트 이후 1회만 로컬 폰트를 절대 경로로 동적 등록하는 헬퍼 (SSR 충돌 방지)
const registerPretendardFont = () => {
  if (typeof window !== "undefined" && !window.__pretendard_registered) {
    try {
      const fontUrl = window.location.origin + "/fonts/Pretendard-Medium.ttf";
      console.log('[PDF] 로컬 Pretendard 폰트 동적 등록 시도 URL:', fontUrl);
      Font.register({ 
        family: "Pretendard", 
        src: fontUrl
      });
      window.__pretendard_registered = true;
      console.log('[PDF] 로컬 Pretendard 폰트 동적 등록 완료!');
    } catch (e) {
      console.log('[PDF] 폰트 등록 무시 (이미 등록되었거나 로드 실패):', e.message);
    }
  }
};

// 표 레이아웃과 텍스트 정렬을 모든 섹션에서 재사용
const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "Pretendard", fontSize: 10, color: "#1f2d3d" },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 14, fontWeight: 700, marginBottom: 8 },
  table: { display: "table", width: "auto", borderStyle: "solid", borderWidth: 1, borderColor: "#d4d6da", borderRightWidth: 0, borderBottomWidth: 0 },
  tableRow: { margin: "auto", flexDirection: "row" },
  tableColHeader: { width: "15%", borderRight: "1px solid #bfbfbf", backgroundColor: "#f2f2f2", padding: 5, fontFamily: "Pretendard", textAlign: "center" },
  tableCol: { padding: 5, borderRight: "1px solid #bfbfbf", textAlign: "center" },
  tableCell: { margin: "auto", marginTop: 2 },
  infoRow: { display: "flex", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  infoBlock: { width: "32%" },
  infoTitle: { fontSize: 12, fontWeight: 600, marginBottom: 4, textAlign: "center" },
  infoContent: { fontSize: 11, textAlign: "center" },
  nameTitle: { fontSize: 20, fontWeight: 700, marginBottom: 16, textAlign: "center" },
  headerSection: { display: "flex", flexDirection: "row", marginBottom: 20, alignItems: "flex-start" },
  photoContainer: { width: 80, height: 100, marginRight: 20, border: "1px solid #d4d6da", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f9f9f9" },
  photoImage: { width: "100%", height: "100%", objectFit: "cover" },
  personalInfoContainer: { flex: 1 },
  personalInfoRow: { display: "flex", flexDirection: "row", marginBottom: 8 },
  personalInfoLabel: { fontSize: 11, fontWeight: 600, width: "20%", marginRight: 8 },
  personalInfoValue: { fontSize: 11, width: "30%" },
  selfIntroSection: { marginBottom: 20 },
  selfIntroTitle: { fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#1f2d3d" },
  selfIntroContent: { fontSize: 10, lineHeight: 1.6, textAlign: "left", padding: 8, backgroundColor: "#f9f9f9", borderRadius: 4 },
});

const ResumePdfDocument = ({ formData }) => {
  registerPretendardFont(); // [로컬 테스트] 클라이언트 단에서만 폰트 동적 등록 실행
  // 이미지 URL 처리: base64인지 URL인지 확인
  const getImageSrc = () => {
    if (!formData.imageUrl) {
      console.log('[PDF] formData.imageUrl이 없습니다.');
      return null;
    }
    
    const url = formData.imageUrl;
    console.log('[PDF] 이미지 소스:', url.substring(0, 50) + '...');
    
    // base64 데이터인 경우 (data:image로 시작)
    if (url.startsWith('data:image/')) {
      console.log('[PDF] base64 이미지 사용');
      return url;
    }

    // 브라우저 임시 Blob 객체 URL인 경우 (blob: 으로 시작)
    if (url.startsWith('blob:')) {
      console.log('[PDF] 브라우저 임시 Blob 이미지 사용:', url);
      return url;
    }
    
    // URL인 경우 - PDF 라이브러리에서 직접 사용 시도
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (url.includes('localhost:8080/uploads/')) {
        console.log('[PDF] 로컬 업로드 이미지 사용:', url);
        return url;
      }
      console.log('[PDF] URL 이미지 사용 (CORS 문제 가능)');
      return url;
    }
    
    // 상대 경로인 경우
    if (url.startsWith('/')) {
      if (url.startsWith('/uploads/')) {
        const fullUrl = `http://localhost:8080${url}`;
        console.log('[PDF] 로컬 상대 경로를 로컬 절대 URL로 변환:', fullUrl);
        return fullUrl;
      }
      const fullUrl = `https://hirepicker-storage.s3.ap-northeast-2.amazonaws.com${url}`;
      console.log('[PDF] 상대 경로를 S3 URL로 변환:', fullUrl);
      return fullUrl;
    }
    
    // S3 키만 있는 경우
    const fullUrl = `https://hirepicker-storage.s3.ap-northeast-2.amazonaws.com/${url}`;
    console.log('[PDF] S3 키를 절대 URL로 변환:', fullUrl);
    return fullUrl;
  };

  const imageSrc = getImageSrc();

  return (
    <Document>
      {/* 첫 번째 페이지: 기본 정보 (이름, 학력, 경력, 병역, 자격증) */}
      <Page size="A4" style={styles.page}>
        {/* 이력서 제목 */}
        <View style={styles.section}>
          <Text style={styles.nameTitle}>{formData.title || formData.resume_title || "이력서"}</Text>
        </View>
        
        {/* 이름 및 기본 정보 */}
        <View style={styles.section}>
          <View style={styles.headerSection}>
            {/* 프로필 사진 */}
            {imageSrc ? (
              <View style={styles.photoContainer}>
                <Image src={imageSrc} style={styles.photoImage} />
              </View>
            ) : (
              <View style={styles.photoContainer}>
                <Text style={{ fontSize: 9, color: "#9ca3af", textAlign: "center" }}>사진 없음</Text>
              </View>
            )}
          {/* 기본 정보 */}
          <View style={styles.personalInfoContainer}>
            <View style={{ ...styles.personalInfoRow, marginBottom: 4 }}>
              <Text style={{ ...styles.personalInfoLabel, fontSize: 12, fontWeight: 700 }}>이름:</Text>
              <Text style={{ ...styles.personalInfoValue, fontSize: 12, fontWeight: 600 }}>{formData.name || ""}</Text>
            </View>
            <View style={styles.personalInfoRow}>
              <Text style={styles.personalInfoLabel}>생년월일:</Text>
              <Text style={styles.personalInfoValue}>{formData.birthdate || ""}</Text>
              <Text style={styles.personalInfoLabel}>성별:</Text>
              <Text style={styles.personalInfoValue}>{formData.gender || ""}</Text>
            </View>
            <View style={styles.personalInfoRow}>
              <Text style={styles.personalInfoLabel}>연락처:</Text>
              <Text style={styles.personalInfoValue}>{formData.phone || ""}</Text>
              <Text style={styles.personalInfoLabel}>이메일:</Text>
              <Text style={styles.personalInfoValue}>{formData.email || ""}</Text>
            </View>
            <View style={styles.personalInfoRow}>
              <Text style={styles.personalInfoLabel}>주소:</Text>
              <Text style={{ ...styles.personalInfoValue, width: "70%" }}>{formData.address || ""}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 학력 정보 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>학력 정보</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={{ ...styles.tableColHeader, width: "25%" }}>기간</Text>
            <Text style={{ ...styles.tableColHeader, width: "20%" }}>학교명</Text>
            <Text style={{ ...styles.tableColHeader, width: "20%" }}>학과</Text>
            <Text style={{ ...styles.tableColHeader, width: "15%" }}>졸업구분</Text>
            <Text style={{ ...styles.tableColHeader, width: "20%", borderRight: 0 }}>학점</Text>
          </View>
          {[1, 2].map((idx) => (
            <View style={{ ...styles.tableRow }} key={idx}>
              <Text style={{ ...styles.tableCol, width: "25%" }}>{formData[`edu${idx}_period`] || ""}</Text>
              <Text style={{ ...styles.tableCol, width: "20%" }}>{formData[`edu${idx}_school`] || ""}</Text>
              <Text style={{ ...styles.tableCol, width: "20%" }}>{formData[`edu${idx}_major`] || ""}</Text>
              <Text style={{ ...styles.tableCol, width: "15%" }}>{formData[`edu${idx}_status`] || ""}</Text>
              <Text style={{ ...styles.tableCol, width: "20%", borderRight: 0 }}>{formData[`edu${idx}_score`] || ""}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 경력 정보 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>경력 정보</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={{ ...styles.tableColHeader, width: "20%" }}>회사명</Text>
            <Text style={{ ...styles.tableColHeader, width: "20%" }}>부서</Text>
            <Text style={{ ...styles.tableColHeader, width: "20%" }}>직책</Text>
            <Text style={{ ...styles.tableColHeader, width: "20%" }}>근무 기간</Text>
            <Text style={{ ...styles.tableColHeader, width: "20%", borderRight: 0 }}>주요 업무</Text>
          </View>
          {[1, 2].map((idx) => (
            <View style={styles.tableRow} key={idx}>
              <Text style={{ ...styles.tableCol, width: "20%" }}>{formData[`exp${idx}_company`] || ""}</Text>
              <Text style={{ ...styles.tableCol, width: "20%" }}>{formData[`exp${idx}_department`] || formData[`exp${idx}_type`] || ""}</Text>
              <Text style={{ ...styles.tableCol, width: "20%" }}>{formData[`exp${idx}_position`] || ""}</Text>
              <Text style={{ ...styles.tableCol, width: "20%" }}>{formData[`exp${idx}_period`] || ""}</Text>
              <Text style={{ ...styles.tableCol, width: "20%", borderRight: 0, textAlign: "left" }}>
                {formData[`exp${idx}_duties`] || ""}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* 병역 정보 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>병역 정보</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={{ ...styles.tableColHeader, width: "33%" }}>복무 구분</Text>
            <Text style={{ ...styles.tableColHeader, width: "33%" }}>군별</Text>
            <Text style={{ ...styles.tableColHeader, width: "34%", borderRight: 0 }}>계급</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={{ ...styles.tableCol, width: "33%" }}>{formData.military_status || formData.military_type || ""}</Text>
            <Text style={{ ...styles.tableCol, width: "33%" }}>{formData.military_branch || ""}</Text>
            <Text style={{ ...styles.tableCol, width: "34%", borderRight: 0 }}>{formData.military_rank || ""}</Text>
          </View>
        </View>
      </View>

      {/* 자격증 정보 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>자격증 정보</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={{ ...styles.tableColHeader, width: "50%" }}>자격증명</Text>
            <Text style={{ ...styles.tableColHeader, width: "50%", borderRight: 0 }}>자격번호</Text>
          </View>
          {[1, 2, 3].map((idx) => (
            <View style={styles.tableRow} key={idx}>
              <Text style={{ ...styles.tableCol, width: "50%" }}>{formData[`cert${idx}_name`] || ""}</Text>
              <Text style={{ ...styles.tableCol, width: "50%", borderRight: 0 }}>{formData[`cert${idx}_code`] || formData[`cert${idx}_score`] || ""}</Text>
            </View>
          ))}
        </View>
      </View>
    </Page>

    {/* 두 번째 페이지: 자기소개서 정보 */}
    <Page size="A4" style={styles.page}>
      <View style={styles.section}>
        <Text style={styles.nameTitle}>{formData.name || "이름"} - 자기소개서</Text>
      </View>

      {/* 성장과정 */}
      <View style={styles.selfIntroSection}>
        <Text style={styles.selfIntroTitle}>1. 성장과정</Text>
        <Text style={styles.selfIntroContent}>{formData.selfGrowth || ""}</Text>
      </View>

      {/* 장단점 및 보완점 */}
      <View style={styles.selfIntroSection}>
        <Text style={styles.selfIntroTitle}>2. 장단점 및 보완점</Text>
        <Text style={styles.selfIntroContent}>{formData.selfStrengths || ""}</Text>
      </View>

      {/* 지원동기 및 직무역량 */}
      <View style={styles.selfIntroSection}>
        <Text style={styles.selfIntroTitle}>3. 지원동기 및 직무역량</Text>
        <Text style={styles.selfIntroContent}>{formData.selfMotivation || ""}</Text>
      </View>

      {/* 입사 후 포부 */}
      <View style={styles.selfIntroSection}>
        <Text style={styles.selfIntroTitle}>4. 입사 후 포부</Text>
        <Text style={styles.selfIntroContent}>{formData.selfAspirations || ""}</Text>
      </View>
    </Page>
  </Document>
  );
};

export default ResumePdfDocument;
