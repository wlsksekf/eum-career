'use client'; 

import { Paper, Typography, TextField, Table, TableBody, TableRow, TableCell, Box, Button, CircularProgress } from '@mui/material';
import { useState, useEffect } from 'react';
import { api, generateAiFullDraft } from '@/api'; // 수정한 axios 인스턴스 및 AI 함수
import { PDFDownloadLink } from '@react-pdf/renderer'; // import 추가
import ResumePdfDocument from '@/components/ResumePdfDocument'; // PDF 컴포넌트 import

export default function ResumeForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isMounted, setIsMounted] = useState(false); // [로컬 테스트] SSR 오류 해결을 위한 마운트 제어 추가
  
  useEffect(() => {
    setIsMounted(true); // [로컬 테스트] 마운트 상태 설정
  }, []);

  const [resumeData, setResumeData] = useState({
    name: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    growthProcess: '',
    jobCompetencies: '',
    prosAndCons: '',
    aspirations: '',
  });

  // --- 기능 1: 사용자 정보 자동 채우기 ---
  useEffect(() => {
    api.get('/api/users/my-profile') 
      .then(res => {
        setResumeData(prev => ({
          ...prev,
          name: res.data.name || '',
          gender: res.data.gender || '',
          phone: res.data.phoneNumber || '',
          email: res.data.email || '',
          address: res.data.address || ''
        }));
      })
      .catch(err => {
        console.error("프로필 정보 로딩 실패:", err);
        alert("사용자 정보를 불러오는데 실패했습니다. 로그인 상태를 확인해주세요.");
      });
  }, []);

  // --- 기능 2: AI 초안 생성 핸들러 ---
  const handleAiGenerate = () => {
    if (!aiPrompt) {
      alert("AI에게 요청할 키워드를 입력해주세요.");
      return;
    }
    setIsLoading(true);

    generateAiFullDraft(aiPrompt)
      .then(res => {
        const { growthProcess, jobCompetencies, prosAndCons, aspirations } = res.data;
        setResumeData(prev => ({
          ...prev,
          growthProcess: growthProcess || '',
          jobCompetencies: jobCompetencies || '',
          prosAndCons: prosAndCons || '',
          aspirations: aspirations || '',
        }));
      })
      .catch(err => {
        console.error("AI 초안 생성 실패:", err);
        alert("AI 초안 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setResumeData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <Paper component="form" sx={{ p: { xs: 2, sm: 4 }, maxWidth: '800px', margin: '2rem auto' }}
      onSubmit={(e) => e.preventDefault()}
    >
      <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'bold' }}>
        입 사 지 원 서
      </Typography>

      <Typography variant="h6" gutterBottom>[인적사항]</Typography>
      <Table sx={{ border: '1px solid #ccc', mb: 3 }}>
        <TableBody>
          <TableRow>
            <TableCell component="th" sx={{ width: '20%', backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>성명</TableCell>
            <TableCell><TextField size="small" fullWidth name="name" value={resumeData.name} onChange={handleChange} /></TableCell>
            <TableCell component="th" sx={{ width: '20%', backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>성별</TableCell>
            <TableCell><TextField size="small" fullWidth name="gender" value={resumeData.gender} onChange={handleChange} /></TableCell>
          </TableRow>
          <TableRow>
            <TableCell component="th" sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>휴 대 폰</TableCell>
            <TableCell><TextField size="small" fullWidth name="phone" value={resumeData.phone} onChange={handleChange} /></TableCell>
            <TableCell component="th" sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>E-mail</TableCell>
            <TableCell><TextField size="small" fullWidth name="email" value={resumeData.email} onChange={handleChange} /></TableCell>
          </TableRow>
          <TableRow>
            <TableCell component="th" sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>주 소</TableCell>
            <TableCell colSpan={3}><TextField size="small" fullWidth name="address" value={resumeData.address} onChange={handleChange} /></TableCell>
          </TableRow>
        </TableBody>
      </Table>
      
      <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>[자기소개서]</Typography>
      
      <Typography variant="subtitle1" sx={{ mt: 2, fontWeight: 'bold' }}>■ 성장과정</Typography>
      <TextField multiline minRows={5} fullWidth name="growthProcess"
        value={resumeData.growthProcess} onChange={handleChange} 
        placeholder="AI로 자동 생성하거나 직접 입력하세요."
      />

      <Typography variant="subtitle1" sx={{ mt: 2, fontWeight: 'bold' }}>■ 업무 관련 역량</Typography>
      <TextField multiline minRows={5} fullWidth name="jobCompetencies"
        value={resumeData.jobCompetencies} onChange={handleChange} 
        placeholder="AI로 자동 생성하거나 직접 입력하세요."
      />

      <Typography variant="subtitle1" sx={{ mt: 2, fontWeight: 'bold' }}>■ 성격 장단점</Typography>
      <TextField multiline minRows={5} fullWidth name="prosAndCons"
        value={resumeData.prosAndCons} onChange={handleChange} 
        placeholder="AI로 자동 생성하거나 직접 입력하세요."
      />

      <Typography variant="subtitle1" sx={{ mt: 2, fontWeight: 'bold' }}>■ 입사 후 포부</Typography>
      <TextField multiline minRows={5} fullWidth name="aspirations"
        value={resumeData.aspirations} onChange={handleChange} 
        placeholder="AI로 자동 생성하거나 직접 입력하세요."
      />

      <Box sx={{ mt: 5, border: '1px dashed grey', p: 3, borderRadius: 2, textAlign: 'center' }}>
        <Typography variant="h6" gutterBottom>★ AI로 자기소개서 초안 완성하기</Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          아래에 핵심 키워드(예: 3년차 백엔드 개발자, AWS EC2/RDS 경험, 꼼꼼한 성격)를 입력하고 버튼을 누르면,
          위 4가지 자기소개서 항목의 초안이 자동으로 완성됩니다.
        </Typography>
        <TextField
          label="AI에게 요청할 키워드를 입력하세요"
          fullWidth
          margin="normal"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <Button 
          variant="contained" 
          onClick={handleAiGenerate} 
          disabled={isLoading}
          size="large"
          sx={{ mt: 1 }}
        >
          {isLoading ? <CircularProgress size={24} color="inherit" /> : "AI로 4종 초안 생성하기"}
        </Button>
      </Box>

      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button variant="outlined" color="primary" size="large">
          내용 임시 저장
        </Button>
        
        {isMounted && (
          <PDFDownloadLink
            document={<ResumePdfDocument resumeData={resumeData} />}
            fileName={`${resumeData.name || '사용자'}_입사지원서.pdf`}
            style={{ textDecoration: 'none' }}
          >
            {({ blob, url, loading, error }) => {
              // [로컬 디버그 로그 추가]
              if (loading) console.log('[PDF-New] 신규 PDF 문서 렌더링 진행 중...');
              if (error) console.error('[PDF-New] 신규 PDF 문서 생성 중 에러 감지됨:', error);
              if (blob) console.log('[PDF-New] 신규 PDF 문서 생성 완료. blob 크기:', blob.size, '바이트');
              
              return (
                <Button 
                  variant="contained" 
                  color="primary" 
                  size="large"
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
                >
                  {loading ? 'PDF 생성 중...' : 'PDF로 다운로드'}
                </Button>
              );
            }}
          </PDFDownloadLink>
        )}
      </Box>
    </Paper>
  );
}
