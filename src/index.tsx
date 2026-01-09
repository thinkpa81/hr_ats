import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS 설정
app.use('/api/*', cors())

// =====================================================
// API Routes
// =====================================================

// 대시보드 통계 API
app.get('/api/dashboard/stats', async (c) => {
  const { DB } = c.env;

  try {
    // 전체 통계 조회
    const jobPostingsCount = await DB.prepare('SELECT COUNT(*) as count FROM job_postings WHERE status = ?').bind('open').first();
    const applicantsCount = await DB.prepare('SELECT COUNT(*) as count FROM applicants').first();
    const applicationsCount = await DB.prepare('SELECT COUNT(*) as count FROM applications').first();
    const interviewsToday = await DB.prepare('SELECT COUNT(*) as count FROM interviews WHERE DATE(interview_date) = DATE("now")').first();

    // 지원자 단계별 통계
    const applicationsByStage = await DB.prepare(`
      SELECT current_stage, COUNT(*) as count 
      FROM applications 
      GROUP BY current_stage
    `).all();

    // 최근 지원자 (상위 5명)
    const recentApplications = await DB.prepare(`
      SELECT 
        a.id, a.applied_at, a.status, a.current_stage, a.ai_match_score,
        ap.name, ap.email, ap.phone, ap.total_experience_years,
        jp.title as job_title, jp.company
      FROM applications a
      JOIN applicants ap ON a.applicant_id = ap.id
      JOIN job_postings jp ON a.job_posting_id = jp.id
      ORDER BY a.applied_at DESC
      LIMIT 5
    `).all();

    // AI 매칭 점수 평균
    const avgMatchScore = await DB.prepare('SELECT AVG(ai_match_score) as avg_score FROM applications WHERE ai_match_score IS NOT NULL').first();

    return c.json({
      success: true,
      data: {
        jobPostings: jobPostingsCount?.count || 0,
        totalApplicants: applicantsCount?.count || 0,
        totalApplications: applicationsCount?.count || 0,
        interviewsToday: interviewsToday?.count || 0,
        applicationsByStage: applicationsByStage.results,
        recentApplications: recentApplications.results,
        averageAIMatchScore: avgMatchScore?.avg_score || 0
      }
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 채용공고 목록 조회
app.get('/api/job-postings', async (c) => {
  const { DB } = c.env;
  const status = c.req.query('status') || 'open';

  try {
    const query = status === 'all' 
      ? 'SELECT * FROM job_postings ORDER BY created_at DESC'
      : 'SELECT * FROM job_postings WHERE status = ? ORDER BY created_at DESC';
    
    const result = status === 'all'
      ? await DB.prepare(query).all()
      : await DB.prepare(query).bind(status).all();

    return c.json({ success: true, data: result.results });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 특정 채용공고 조회
app.get('/api/job-postings/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');

  try {
    const jobPosting = await DB.prepare('SELECT * FROM job_postings WHERE id = ?').bind(id).first();
    
    if (!jobPosting) {
      return c.json({ success: false, error: 'Job posting not found' }, 404);
    }

    // 해당 공고의 지원자 수
    const applicantsCount = await DB.prepare('SELECT COUNT(*) as count FROM applications WHERE job_posting_id = ?').bind(id).first();

    return c.json({ 
      success: true, 
      data: {
        ...jobPosting,
        applicants_count: applicantsCount?.count || 0
      }
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 지원자 목록 조회
app.get('/api/applications', async (c) => {
  const { DB } = c.env;
  const jobPostingId = c.req.query('job_posting_id');
  const status = c.req.query('status');
  const stage = c.req.query('stage');
  const sortBy = c.req.query('sort_by') || 'applied_at';
  const order = c.req.query('order') || 'DESC';

  try {
    let query = `
      SELECT 
        a.id, a.applied_at, a.status, a.current_stage, a.ai_match_score, a.screening_score,
        ap.name, ap.email, ap.phone, ap.education_level, ap.university, ap.total_experience_years,
        jp.title as job_title, jp.company
      FROM applications a
      JOIN applicants ap ON a.applicant_id = ap.id
      JOIN job_postings jp ON a.job_posting_id = jp.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (jobPostingId) {
      query += ' AND a.job_posting_id = ?';
      params.push(jobPostingId);
    }

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (stage) {
      query += ' AND a.current_stage = ?';
      params.push(stage);
    }

    query += ` ORDER BY a.${sortBy} ${order}`;

    let stmt = DB.prepare(query);
    params.forEach(param => {
      stmt = stmt.bind(param);
    });

    const result = await stmt.all();

    return c.json({ success: true, data: result.results });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 특정 지원자 상세 조회
app.get('/api/applications/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');

  try {
    // 지원내역 기본 정보
    const application = await DB.prepare(`
      SELECT 
        a.*, 
        ap.name, ap.email, ap.phone, ap.birth_date, ap.gender, ap.address,
        ap.education_level, ap.university, ap.major, ap.graduation_date,
        ap.total_experience_years, ap.current_company, ap.current_position,
        ap.resume_url, ap.portfolio_url, ap.linkedin_url, ap.github_url, ap.referral_source,
        jp.title as job_title, jp.company, jp.department, jp.position_level
      FROM applications a
      JOIN applicants ap ON a.applicant_id = ap.id
      JOIN job_postings jp ON a.job_posting_id = jp.id
      WHERE a.id = ?
    `).bind(id).first();

    if (!application) {
      return c.json({ success: false, error: 'Application not found' }, 404);
    }

    // 면접 일정
    const interviews = await DB.prepare(`
      SELECT * FROM interviews WHERE application_id = ? ORDER BY interview_date ASC
    `).bind(id).all();

    // 면접 평가
    const evaluations = await DB.prepare(`
      SELECT ie.* 
      FROM interview_evaluations ie
      JOIN interviews i ON ie.interview_id = i.id
      WHERE i.application_id = ?
      ORDER BY ie.created_at DESC
    `).bind(id).all();

    // 프로세스 로그
    const processLogs = await DB.prepare(`
      SELECT * FROM process_logs WHERE application_id = ? ORDER BY created_at DESC
    `).bind(id).all();

    return c.json({
      success: true,
      data: {
        application,
        interviews: interviews.results,
        evaluations: evaluations.results,
        processLogs: processLogs.results
      }
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 지원자 상태 업데이트
app.put('/api/applications/:id/status', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');
  const { status, current_stage, notes, performer } = await c.req.json();

  try {
    // 지원자 상태 업데이트
    await DB.prepare(`
      UPDATE applications 
      SET status = ?, current_stage = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(status, current_stage, id).run();

    // 프로세스 로그 기록
    await DB.prepare(`
      INSERT INTO process_logs (application_id, stage, action, performer, notes)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, current_stage, `상태 변경: ${status}`, performer || 'system', notes || '').run();

    return c.json({ success: true, message: 'Application status updated' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 면접 일정 생성
app.post('/api/interviews', async (c) => {
  const { DB } = c.env;
  const data = await c.req.json();

  try {
    const result = await DB.prepare(`
      INSERT INTO interviews (
        application_id, interview_type, interview_round, interview_date,
        interview_location, interview_method, interviewers, duration_minutes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.application_id,
      data.interview_type,
      data.interview_round,
      data.interview_date,
      data.interview_location,
      data.interview_method,
      JSON.stringify(data.interviewers),
      data.duration_minutes || 60,
      'scheduled'
    ).run();

    // 지원자 상태 업데이트
    await DB.prepare(`
      UPDATE applications 
      SET status = 'interview', current_stage = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(data.interview_type, data.application_id).run();

    // 프로세스 로그 기록
    await DB.prepare(`
      INSERT INTO process_logs (application_id, stage, action, performer, notes)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.application_id,
      data.interview_type,
      '면접 일정 확정',
      data.performer || 'system',
      `${data.interview_date} ${data.interview_location}`
    ).run();

    return c.json({ success: true, data: { id: result.meta.last_row_id } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 면접 평가 저장
app.post('/api/interview-evaluations', async (c) => {
  const { DB } = c.env;
  const data = await c.req.json();

  try {
    const result = await DB.prepare(`
      INSERT INTO interview_evaluations (
        interview_id, interviewer_name, interviewer_position,
        technical_score, communication_score, culture_fit_score,
        problem_solving_score, leadership_score, total_score,
        strengths, weaknesses, recommendation, detailed_feedback
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.interview_id,
      data.interviewer_name,
      data.interviewer_position,
      data.technical_score,
      data.communication_score,
      data.culture_fit_score,
      data.problem_solving_score,
      data.leadership_score,
      data.total_score,
      data.strengths,
      data.weaknesses,
      data.recommendation,
      data.detailed_feedback
    ).run();

    // 면접 상태 업데이트
    await DB.prepare(`
      UPDATE interviews SET status = 'completed' WHERE id = ?
    `).bind(data.interview_id).run();

    return c.json({ success: true, data: { id: result.meta.last_row_id } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// AI 매칭 점수 계산 (Mock)
app.post('/api/applications/:id/ai-match', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');

  try {
    // 실제로는 AI 모델 호출하여 점수 계산
    // 여기서는 간단한 로직으로 Mock
    const application = await DB.prepare(`
      SELECT a.*, ap.*, jp.*
      FROM applications a
      JOIN applicants ap ON a.applicant_id = ap.id
      JOIN job_postings jp ON a.job_posting_id = jp.id
      WHERE a.id = ?
    `).bind(id).first();

    if (!application) {
      return c.json({ success: false, error: 'Application not found' }, 404);
    }

    // 간단한 점수 계산 로직 (실제로는 AI 모델 사용)
    let score = 70; // 기본 점수
    const reasons: string[] = [];

    // 학력 매칭
    if (application.education_level === '석사' || application.education_level === '박사') {
      score += 10;
      reasons.push(`${application.education_level} 학위 보유`);
    }

    // 경력 매칭
    if (application.total_experience_years >= 3) {
      score += 10;
      reasons.push(`${application.total_experience_years}년 실무 경력`);
    }

    // 키워드 매칭 (자기소개서)
    if (application.cover_letter) {
      const keywords = ['AI', 'ML', '딥러닝', '머신러닝', 'Python', 'TensorFlow', 'PyTorch'];
      const matchedKeywords = keywords.filter(k => application.cover_letter.includes(k));
      if (matchedKeywords.length > 0) {
        score += matchedKeywords.length * 2;
        reasons.push(`핵심 키워드 ${matchedKeywords.length}개 매칭`);
      }
    }

    // 최대 100점 제한
    score = Math.min(score, 100);

    const matchReason = reasons.join(', ');

    // AI 매칭 점수 업데이트
    await DB.prepare(`
      UPDATE applications 
      SET ai_match_score = ?, ai_match_reason = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(score, matchReason, id).run();

    // 프로세스 로그 기록
    await DB.prepare(`
      INSERT INTO process_logs (application_id, stage, action, performer, notes)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, '서류전형', 'AI 매칭 완료', 'system', `AI 매칭점수: ${score}점`).run();

    return c.json({
      success: true,
      data: {
        ai_match_score: score,
        ai_match_reason: matchReason
      }
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// =====================================================
// 신규 기능: 이력서 업로드 및 AI 분석
// =====================================================

// 이력서 직접 업로드 및 지원자 생성
app.post('/api/applicants/upload-resume', async (c) => {
  const { DB } = c.env;
  
  try {
    // FormData에서 데이터 추출
    const formData = await c.req.parseBody();
    
    // 이력서 텍스트 분석 (실제로는 파일 파싱하지만 여기서는 텍스트로 받음)
    const resumeText = formData.resume_text as string || '';
    const jobPostingId = formData.job_posting_id as string;
    
    // AI 기반 이력서 분석 (실제로는 OpenAI/Claude API 호출)
    const analysis = analyzeResume(resumeText);
    
    // 지원자 정보 추출
    const applicantData = {
      name: formData.name as string,
      email: formData.email as string,
      phone: formData.phone as string,
      birth_date: formData.birth_date as string || null,
      gender: formData.gender as string || null,
      education_level: analysis.education_level,
      university: analysis.university,
      major: analysis.major,
      graduation_date: analysis.graduation_date,
      total_experience_years: analysis.total_experience_years,
      current_company: analysis.current_company,
      current_position: analysis.current_position,
      referral_source: '직접 업로드',
      resume_url: formData.resume_url as string || null
    };

    // 지원자 생성 (중복 이메일 체크)
    let applicantId;
    const existingApplicant = await DB.prepare(
      'SELECT id FROM applicants WHERE email = ?'
    ).bind(applicantData.email).first();

    if (existingApplicant) {
      applicantId = existingApplicant.id;
    } else {
      const applicantResult = await DB.prepare(`
        INSERT INTO applicants (
          name, email, phone, birth_date, gender, education_level, university, major,
          graduation_date, total_experience_years, current_company, current_position,
          referral_source, resume_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        applicantData.name,
        applicantData.email,
        applicantData.phone,
        applicantData.birth_date,
        applicantData.gender,
        applicantData.education_level,
        applicantData.university,
        applicantData.major,
        applicantData.graduation_date,
        applicantData.total_experience_years,
        applicantData.current_company,
        applicantData.current_position,
        applicantData.referral_source,
        applicantData.resume_url
      ).run();
      
      applicantId = applicantResult.meta.last_row_id;
    }

    // 지원내역 생성
    const coverLetter = formData.cover_letter as string || '';
    const applicationResult = await DB.prepare(`
      INSERT INTO applications (
        job_posting_id, applicant_id, cover_letter, status, current_stage
      ) VALUES (?, ?, ?, 'submitted', '서류전형')
    `).bind(jobPostingId, applicantId, coverLetter).run();

    const applicationId = applicationResult.meta.last_row_id;

    // AI 매칭 점수 자동 계산
    const jobPosting = await DB.prepare(
      'SELECT * FROM job_postings WHERE id = ?'
    ).bind(jobPostingId).first();

    const matchScore = calculateMatchScore(analysis, jobPosting, resumeText, coverLetter);

    // AI 매칭 점수 업데이트
    await DB.prepare(`
      UPDATE applications 
      SET ai_match_score = ?, ai_match_reason = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(matchScore.score, matchScore.reason, applicationId).run();

    // 프로세스 로그 기록
    await DB.prepare(`
      INSERT INTO process_logs (application_id, stage, action, performer, notes)
      VALUES (?, ?, ?, ?, ?)
    `).bind(applicationId, '서류전형', '지원서 접수', 'system', '이력서 직접 업로드').run();

    // 이메일 로그 기록
    await DB.prepare(`
      INSERT INTO email_logs (
        recipient_email, recipient_name, email_type, subject, body, status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      applicantData.email,
      applicantData.name,
      'application_received',
      '[ATS] 지원서 접수 완료',
      `안녕하세요 ${applicantData.name}님, 지원서가 정상적으로 접수되었습니다. 서류 전형 결과는 일주일 내 안내드리겠습니다.`,
      'pending'
    ).run();

    return c.json({
      success: true,
      data: {
        applicant_id: applicantId,
        application_id: applicationId,
        ai_match_score: matchScore.score,
        ai_match_reason: matchScore.reason,
        analysis: analysis
      }
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 이메일 로그 조회
app.get('/api/emails', async (c) => {
  const { DB } = c.env;
  const status = c.req.query('status');
  const type = c.req.query('type');

  try {
    let query = 'SELECT * FROM email_logs WHERE 1=1';
    const params: any[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (type) {
      query += ' AND email_type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    let stmt = DB.prepare(query);
    params.forEach(param => {
      stmt = stmt.bind(param);
    });

    const result = await stmt.all();

    return c.json({ success: true, data: result.results });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 이메일 발송 API
app.post('/api/emails/send', async (c) => {
  const { DB } = c.env;
  const data = await c.req.json();

  try {
    // 실제로는 SMTP 또는 이메일 API 호출
    // 여기서는 로그만 기록
    const result = await DB.prepare(`
      INSERT INTO email_logs (
        recipient_email, recipient_name, email_type, subject, body, status, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      data.recipient_email,
      data.recipient_name,
      data.email_type,
      data.subject,
      data.body,
      'sent'
    ).run();

    return c.json({ 
      success: true, 
      data: { id: result.meta.last_row_id },
      message: '이메일이 발송되었습니다 (실제 환경에서는 SMTP 연동 필요)'
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 이메일 상태 업데이트
app.put('/api/emails/:id/status', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');
  const { status } = await c.req.json();

  try {
    await DB.prepare(`
      UPDATE email_logs SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(status, id).run();

    return c.json({ success: true, message: 'Email status updated' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// =====================================================
// 헬퍼 함수: 이력서 분석
// =====================================================

function analyzeResume(resumeText: string) {
  // 실제로는 OpenAI/Claude API로 분석하지만 여기서는 간단한 파싱
  const analysis: any = {
    education_level: '학사',
    university: '',
    major: '',
    graduation_date: null,
    total_experience_years: 0,
    current_company: '',
    current_position: '',
    skills: [],
    certifications: []
  };

  // 학력 추출
  if (resumeText.includes('박사')) {
    analysis.education_level = '박사';
  } else if (resumeText.includes('석사')) {
    analysis.education_level = '석사';
  }

  // 대학 추출 (간단한 패턴 매칭)
  const universities = ['서울대', '연세대', '고려대', '카이스트', 'KAIST', 'MIT', 'Stanford'];
  for (const univ of universities) {
    if (resumeText.includes(univ)) {
      analysis.university = univ;
      break;
    }
  }

  // 경력 추출 (숫자 + 년 패턴)
  const experienceMatch = resumeText.match(/(\d+)년/);
  if (experienceMatch) {
    analysis.total_experience_years = parseInt(experienceMatch[1]);
  }

  // 기술 스택 추출
  const techKeywords = ['Python', 'Java', 'JavaScript', 'React', 'Node.js', 'AI', 'ML', '딥러닝', '머신러닝'];
  analysis.skills = techKeywords.filter(tech => resumeText.includes(tech));

  return analysis;
}

// =====================================================
// 헬퍼 함수: 매칭 점수 계산
// =====================================================

function calculateMatchScore(analysis: any, jobPosting: any, resumeText: string, coverLetter: string) {
  let score = 60; // 기본 점수
  const reasons: string[] = [];

  // 학력 매칭
  if (analysis.education_level === '박사') {
    score += 15;
    reasons.push('박사 학위 보유');
  } else if (analysis.education_level === '석사') {
    score += 10;
    reasons.push('석사 학위 보유');
  } else if (analysis.education_level === '학사') {
    score += 5;
    reasons.push('학사 학위 보유');
  }

  // 경력 매칭
  if (analysis.total_experience_years >= 5) {
    score += 15;
    reasons.push(`${analysis.total_experience_years}년 풍부한 경력`);
  } else if (analysis.total_experience_years >= 3) {
    score += 10;
    reasons.push(`${analysis.total_experience_years}년 실무 경력`);
  } else if (analysis.total_experience_years >= 1) {
    score += 5;
    reasons.push(`${analysis.total_experience_years}년 경력`);
  }

  // 기술 스택 매칭
  if (analysis.skills && analysis.skills.length > 0) {
    const skillScore = Math.min(analysis.skills.length * 3, 15);
    score += skillScore;
    reasons.push(`핵심 기술 ${analysis.skills.length}개 보유`);
  }

  // 키워드 매칭 (채용공고 요구사항과 비교)
  if (jobPosting && jobPosting.requirements) {
    const requirements = jobPosting.requirements.toLowerCase();
    const fullText = (resumeText + ' ' + coverLetter).toLowerCase();
    
    const jobKeywords = requirements.split(/[,\s]+/).filter((k: string) => k.length > 2);
    const matchedCount = jobKeywords.filter((k: string) => fullText.includes(k)).length;
    
    if (matchedCount > 0) {
      const keywordScore = Math.min(matchedCount * 2, 10);
      score += keywordScore;
      reasons.push(`채용공고 키워드 ${matchedCount}개 매칭`);
    }
  }

  // 최대 100점 제한
  score = Math.min(score, 100);

  return {
    score,
    reason: reasons.join(', ')
  };
}

// 통계 분석 API
app.get('/api/analytics/funnel', async (c) => {
  const { DB } = c.env;

  try {
    // 채용 퍼널 분석
    const funnelData = await DB.prepare(`
      SELECT 
        status,
        COUNT(*) as count,
        ROUND(AVG(ai_match_score), 2) as avg_match_score
      FROM applications
      GROUP BY status
      ORDER BY 
        CASE status
          WHEN 'submitted' THEN 1
          WHEN 'screening' THEN 2
          WHEN 'interview' THEN 3
          WHEN 'offer' THEN 4
          WHEN 'hired' THEN 5
          WHEN 'rejected' THEN 6
          ELSE 7
        END
    `).all();

    // 단계별 전환율 계산
    const results = funnelData.results as any[];
    const totalApplications = results.reduce((sum, item) => sum + (item.count || 0), 0);
    
    const funnelWithConversion = results.map((item, index) => {
      const conversionRate = totalApplications > 0 ? ((item.count / totalApplications) * 100).toFixed(2) : 0;
      return {
        ...item,
        conversion_rate: conversionRate
      };
    });

    return c.json({
      success: true,
      data: {
        funnel: funnelWithConversion,
        total_applications: totalApplications
      }
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 채용공고별 통계
app.get('/api/analytics/by-job-posting', async (c) => {
  const { DB } = c.env;

  try {
    const stats = await DB.prepare(`
      SELECT 
        jp.id,
        jp.title,
        jp.company,
        jp.department,
        COUNT(a.id) as total_applications,
        AVG(a.ai_match_score) as avg_match_score,
        SUM(CASE WHEN a.status = 'offer' OR a.status = 'hired' THEN 1 ELSE 0 END) as offers,
        SUM(CASE WHEN a.status = 'rejected' THEN 1 ELSE 0 END) as rejections
      FROM job_postings jp
      LEFT JOIN applications a ON jp.id = a.job_posting_id
      WHERE jp.status = 'open'
      GROUP BY jp.id, jp.title, jp.company, jp.department
      ORDER BY total_applications DESC
    `).all();

    return c.json({ success: true, data: stats.results });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// =====================================================
// 메인 페이지 (HTML)
// =====================================================

app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ATS - 지능형 채용관리 시스템</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    </head>
    <body class="bg-gray-50">
        <!-- 네비게이션 -->
        <nav class="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between h-16">
                    <div class="flex items-center">
                        <i class="fas fa-briefcase text-2xl mr-3"></i>
                        <span class="text-xl font-bold">ATS</span>
                    </div>
                    <div class="flex items-center space-x-6">
                        <a href="#" onclick="showTab('dashboard')" class="nav-link hover:text-blue-200 transition"><i class="fas fa-chart-line mr-2"></i>대시보드</a>
                        <a href="#" onclick="showTab('upload')" class="nav-link hover:text-blue-200 transition"><i class="fas fa-file-upload mr-2"></i>이력서 업로드</a>
                        <a href="#" onclick="showTab('applications')" class="nav-link hover:text-blue-200 transition"><i class="fas fa-users mr-2"></i>지원자 관리</a>
                        <a href="#" onclick="showTab('emails')" class="nav-link hover:text-blue-200 transition"><i class="fas fa-envelope mr-2"></i>이메일 관리</a>
                        <a href="#" onclick="showTab('analytics')" class="nav-link hover:text-blue-200 transition"><i class="fas fa-chart-bar mr-2"></i>통계 분석</a>
                    </div>
                </div>
            </div>
        </nav>

        <!-- 메인 컨텐츠 -->
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <!-- 대시보드 탭 -->
            <div id="dashboard-tab" class="tab-content">
                <h2 class="text-3xl font-bold text-gray-800 mb-6">
                    <i class="fas fa-tachometer-alt mr-3 text-blue-600"></i>채용 현황 대시보드
                </h2>
                
                <!-- 핵심 지표 카드 -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div class="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm mb-1">진행중인 채용공고</p>
                                <p class="text-3xl font-bold text-gray-800" id="job-postings-count">-</p>
                            </div>
                            <div class="bg-blue-100 rounded-full p-3">
                                <i class="fas fa-file-alt text-blue-600 text-2xl"></i>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm mb-1">총 지원자</p>
                                <p class="text-3xl font-bold text-gray-800" id="applicants-count">-</p>
                            </div>
                            <div class="bg-green-100 rounded-full p-3">
                                <i class="fas fa-user-friends text-green-600 text-2xl"></i>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm mb-1">전체 지원 건수</p>
                                <p class="text-3xl font-bold text-gray-800" id="applications-count">-</p>
                            </div>
                            <div class="bg-purple-100 rounded-full p-3">
                                <i class="fas fa-paper-plane text-purple-600 text-2xl"></i>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-lg shadow-md p-6 border-l-4 border-orange-500">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm mb-1">오늘 면접 일정</p>
                                <p class="text-3xl font-bold text-gray-800" id="interviews-today">-</p>
                            </div>
                            <div class="bg-orange-100 rounded-full p-3">
                                <i class="fas fa-calendar-check text-orange-600 text-2xl"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- AI 매칭 점수 & 단계별 현황 -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div class="bg-white rounded-lg shadow-md p-6">
                        <h3 class="text-xl font-bold text-gray-800 mb-4">
                            <i class="fas fa-robot mr-2 text-blue-600"></i>AI 매칭 평균 점수
                        </h3>
                        <div class="flex items-center justify-center h-40">
                            <div class="text-center">
                                <p class="text-6xl font-bold text-blue-600" id="avg-match-score">-</p>
                                <p class="text-gray-500 mt-2">/ 100점</p>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-lg shadow-md p-6">
                        <h3 class="text-xl font-bold text-gray-800 mb-4">
                            <i class="fas fa-layer-group mr-2 text-green-600"></i>단계별 지원자 현황
                        </h3>
                        <div id="stages-list" class="space-y-2"></div>
                    </div>
                </div>

                <!-- 최근 지원자 목록 -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-clock mr-2 text-purple-600"></i>최근 지원자 (상위 5명)
                    </h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">지원자명</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">채용공고</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">법인</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">경력</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">AI 점수</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">지원일</th>
                                </tr>
                            </thead>
                            <tbody id="recent-applications" class="bg-white divide-y divide-gray-200">
                                <!-- 데이터 로드 -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 이력서 업로드 탭 -->
            <div id="upload-tab" class="tab-content hidden">
                <h2 class="text-3xl font-bold text-gray-800 mb-6">
                    <i class="fas fa-file-upload mr-3 text-purple-600"></i>이력서 직접 업로드
                </h2>

                <!-- 안내 메시지 -->
                <div class="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6 rounded-lg">
                    <div class="flex items-start">
                        <i class="fas fa-info-circle text-blue-500 text-2xl mr-4 mt-1"></i>
                        <div>
                            <h3 class="text-lg font-bold text-blue-800 mb-2">AI 기반 자동 분석 시스템</h3>
                            <p class="text-blue-700">
                                업로드된 이력서는 AI가 자동으로 분석하여 <strong>학력, 경력, 기술 스택</strong>을 추출하고,
                                채용공고와의 <strong>적합도를 100점 만점으로 자동 평가</strong>합니다.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- 이력서 업로드 폼 -->
                <div class="bg-white rounded-lg shadow-md p-8">
                    <form id="resume-upload-form" class="space-y-6">
                        <!-- 채용공고 선택 -->
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-2">
                                <i class="fas fa-briefcase mr-2 text-blue-600"></i>지원 채용공고 <span class="text-red-500">*</span>
                            </label>
                            <select id="upload-job-posting" required class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                <option value="">채용공고를 선택하세요</option>
                            </select>
                        </div>

                        <!-- 기본 정보 -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">
                                    <i class="fas fa-user mr-2 text-green-600"></i>이름 <span class="text-red-500">*</span>
                                </label>
                                <input type="text" id="upload-name" required class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="홍길동">
                            </div>

                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">
                                    <i class="fas fa-envelope mr-2 text-red-600"></i>이메일 <span class="text-red-500">*</span>
                                </label>
                                <input type="email" id="upload-email" required class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="example@email.com">
                            </div>

                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">
                                    <i class="fas fa-phone mr-2 text-yellow-600"></i>연락처 <span class="text-red-500">*</span>
                                </label>
                                <input type="tel" id="upload-phone" required class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="010-1234-5678">
                            </div>

                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">
                                    <i class="fas fa-calendar mr-2 text-purple-600"></i>생년월일
                                </label>
                                <input type="date" id="upload-birth-date" class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>

                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">
                                    <i class="fas fa-venus-mars mr-2 text-pink-600"></i>성별
                                </label>
                                <select id="upload-gender" class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="">선택하세요</option>
                                    <option value="남">남</option>
                                    <option value="여">여</option>
                                </select>
                            </div>
                        </div>

                        <!-- 이력서 텍스트 -->
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-2">
                                <i class="fas fa-file-alt mr-2 text-indigo-600"></i>이력서 내용 <span class="text-red-500">*</span>
                            </label>
                            <textarea id="upload-resume-text" required rows="8" class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="이력서 내용을 입력하세요. 학력, 경력, 기술 스택 등을 상세히 작성하면 AI 분석 정확도가 높아집니다.

예시:
- 서울대학교 컴퓨터공학과 학사 졸업 (2018)
- NAVER AI Lab 선임연구원 (3년 경력)
- 기술 스택: Python, TensorFlow, PyTorch, 딥러닝, NLP
- 프로젝트: 대화형 AI 챗봇 개발, 추천 시스템 구축"></textarea>
                        </div>

                        <!-- 자기소개서 -->
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-2">
                                <i class="fas fa-pen-fancy mr-2 text-orange-600"></i>자기소개서 (선택)
                            </label>
                            <textarea id="upload-cover-letter" rows="6" class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="지원 동기, 포부 등을 자유롭게 작성하세요."></textarea>
                        </div>

                        <!-- 제출 버튼 -->
                        <div class="flex items-center justify-end space-x-4">
                            <button type="button" onclick="document.getElementById('resume-upload-form').reset()" class="px-6 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold rounded-lg transition">
                                <i class="fas fa-undo mr-2"></i>초기화
                            </button>
                            <button type="submit" class="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-lg shadow-lg transition transform hover:scale-105">
                                <i class="fas fa-paper-plane mr-2"></i>이력서 제출 및 AI 분석 시작
                            </button>
                        </div>
                    </form>
                </div>

                <!-- AI 분석 결과 (제출 후 표시) -->
                <div id="upload-result" class="hidden mt-6">
                    <div class="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg">
                        <div class="flex items-start">
                            <i class="fas fa-check-circle text-green-500 text-3xl mr-4"></i>
                            <div class="flex-1">
                                <h3 class="text-xl font-bold text-green-800 mb-3">
                                    <i class="fas fa-robot mr-2"></i>AI 분석 완료!
                                </h3>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    <div class="bg-white p-4 rounded-lg shadow">
                                        <p class="text-sm text-gray-600 mb-1">AI 매칭 점수</p>
                                        <p class="text-3xl font-bold text-blue-600" id="result-score">-</p>
                                    </div>
                                    <div class="bg-white p-4 rounded-lg shadow">
                                        <p class="text-sm text-gray-600 mb-1">추출된 경력</p>
                                        <p class="text-2xl font-bold text-green-600" id="result-experience">-</p>
                                    </div>
                                    <div class="bg-white p-4 rounded-lg shadow">
                                        <p class="text-sm text-gray-600 mb-1">학력</p>
                                        <p class="text-2xl font-bold text-purple-600" id="result-education">-</p>
                                    </div>
                                </div>
                                <div class="bg-white p-4 rounded-lg shadow">
                                    <p class="text-sm font-bold text-gray-700 mb-2">
                                        <i class="fas fa-lightbulb mr-2 text-yellow-500"></i>매칭 근거
                                    </p>
                                    <p class="text-gray-700" id="result-reason">-</p>
                                </div>
                                <div class="mt-4 flex space-x-3">
                                    <button onclick="showTab('applications')" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition">
                                        <i class="fas fa-users mr-2"></i>지원자 목록에서 확인
                                    </button>
                                    <button onclick="document.getElementById('upload-result').classList.add('hidden'); document.getElementById('resume-upload-form').reset();" class="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition">
                                        <i class="fas fa-plus mr-2"></i>새 지원자 추가
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 지원자 관리 탭 -->
            <div id="applications-tab" class="tab-content hidden">
                <h2 class="text-3xl font-bold text-gray-800 mb-6">
                    <i class="fas fa-users mr-3 text-green-600"></i>지원자 관리
                </h2>

                <!-- 필터 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">상태</label>
                            <select id="filter-status" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                <option value="">전체</option>
                                <option value="submitted">제출됨</option>
                                <option value="screening">서류전형</option>
                                <option value="interview">면접</option>
                                <option value="offer">제안</option>
                                <option value="hired">채용완료</option>
                                <option value="rejected">불합격</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">단계</label>
                            <select id="filter-stage" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                <option value="">전체</option>
                                <option value="서류전형">서류전형</option>
                                <option value="1차면접">1차면접</option>
                                <option value="2차면접">2차면접</option>
                                <option value="최종합격">최종합격</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">정렬</label>
                            <select id="sort-by" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                <option value="applied_at">지원일</option>
                                <option value="ai_match_score">AI 매칭점수</option>
                                <option value="screening_score">서류점수</option>
                            </select>
                        </div>
                        <div class="flex items-end">
                            <button onclick="loadApplications()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition">
                                <i class="fas fa-search mr-2"></i>검색
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 지원자 목록 -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">지원자명</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">연락처</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">학력</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">경력</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">채용공고</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">AI 점수</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">서류 점수</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">현재 단계</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상세</th>
                                </tr>
                            </thead>
                            <tbody id="applications-list" class="bg-white divide-y divide-gray-200">
                                <!-- 데이터 로드 -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 이메일 관리 탭 -->
            <div id="emails-tab" class="tab-content hidden">
                <h2 class="text-3xl font-bold text-gray-800 mb-6">
                    <i class="fas fa-envelope mr-3 text-red-600"></i>이메일 접수 및 관리
                </h2>

                <!-- 통계 카드 -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    <div class="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm mb-1">발송 완료</p>
                                <p class="text-3xl font-bold text-green-600" id="email-sent-count">0</p>
                            </div>
                            <i class="fas fa-check-circle text-green-500 text-3xl"></i>
                        </div>
                    </div>

                    <div class="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm mb-1">발송 대기</p>
                                <p class="text-3xl font-bold text-yellow-600" id="email-pending-count">0</p>
                            </div>
                            <i class="fas fa-clock text-yellow-500 text-3xl"></i>
                        </div>
                    </div>

                    <div class="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm mb-1">발송 실패</p>
                                <p class="text-3xl font-bold text-red-600" id="email-failed-count">0</p>
                            </div>
                            <i class="fas fa-exclamation-circle text-red-500 text-3xl"></i>
                        </div>
                    </div>

                    <div class="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-500 text-sm mb-1">전체 이메일</p>
                                <p class="text-3xl font-bold text-blue-600" id="email-total-count">0</p>
                            </div>
                            <i class="fas fa-envelope text-blue-500 text-3xl"></i>
                        </div>
                    </div>
                </div>

                <!-- 새 이메일 발송 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-paper-plane mr-2 text-blue-600"></i>새 이메일 발송
                    </h3>
                    <form id="email-send-form" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">수신자 이메일</label>
                                <input type="email" id="email-recipient" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="recipient@example.com">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">수신자 이름</label>
                                <input type="text" id="email-recipient-name" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="홍길동">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">이메일 유형</label>
                            <select id="email-type" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                <option value="application_received">지원서 접수 확인</option>
                                <option value="interview_scheduled">면접 일정 안내</option>
                                <option value="offer">최종 합격 통보</option>
                                <option value="rejection">불합격 안내</option>
                                <option value="custom">사용자 정의</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">제목</label>
                            <input type="text" id="email-subject" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="[ATS] 이메일 제목">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">본문</label>
                            <textarea id="email-body" required rows="6" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="이메일 본문을 입력하세요..."></textarea>
                        </div>
                        <div class="flex justify-end">
                            <button type="submit" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition">
                                <i class="fas fa-paper-plane mr-2"></i>발송
                            </button>
                        </div>
                    </form>
                </div>

                <!-- 필터 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">발송 상태</label>
                            <select id="email-filter-status" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                <option value="">전체</option>
                                <option value="sent">발송 완료</option>
                                <option value="pending">발송 대기</option>
                                <option value="failed">발송 실패</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">이메일 유형</label>
                            <select id="email-filter-type" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                <option value="">전체</option>
                                <option value="application_received">지원서 접수</option>
                                <option value="interview_scheduled">면접 안내</option>
                                <option value="offer">합격 통보</option>
                                <option value="rejection">불합격 안내</option>
                            </select>
                        </div>
                        <div class="flex items-end">
                            <button onclick="loadEmails()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition">
                                <i class="fas fa-search mr-2"></i>검색
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 이메일 목록 -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-list mr-2 text-purple-600"></i>이메일 발송 내역
                    </h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">수신자</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">유형</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">제목</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">발송일시</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">액션</th>
                                </tr>
                            </thead>
                            <tbody id="emails-list" class="bg-white divide-y divide-gray-200">
                                <!-- 데이터 로드 -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 통계 분석 탭 -->
            <div id="analytics-tab" class="tab-content hidden">
                <h2 class="text-3xl font-bold text-gray-800 mb-6">
                    <i class="fas fa-chart-bar mr-3 text-purple-600"></i>통계 분석
                </h2>

                <!-- 채용 퍼널 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-filter mr-2 text-blue-600"></i>채용 퍼널 (Recruitment Funnel)
                    </h3>
                    <canvas id="funnelChart" height="80"></canvas>
                </div>

                <!-- 채용공고별 통계 -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-briefcase mr-2 text-green-600"></i>채용공고별 통계
                    </h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">채용공고</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">법인</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">부서</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">지원자 수</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">평균 매칭점수</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">제안/채용</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">불합격</th>
                                </tr>
                            </thead>
                            <tbody id="job-stats-list" class="bg-white divide-y divide-gray-200">
                                <!-- 데이터 로드 -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <script>
            // 전역 변수
            let funnelChart = null;

            // 탭 전환
            function showTab(tab) {
                // 모든 탭 숨기기
                document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
                
                // 선택된 탭 표시
                document.getElementById(tab + '-tab').classList.remove('hidden');

                // 데이터 로드
                if (tab === 'dashboard') {
                    loadDashboard();
                } else if (tab === 'upload') {
                    loadJobPostingsForUpload();
                } else if (tab === 'applications') {
                    loadApplications();
                } else if (tab === 'emails') {
                    loadEmails();
                } else if (tab === 'analytics') {
                    loadAnalytics();
                }
            }

            // 대시보드 데이터 로드
            async function loadDashboard() {
                try {
                    const response = await fetch('/api/dashboard/stats');
                    const result = await response.json();

                    if (result.success) {
                        const data = result.data;

                        // 핵심 지표 업데이트
                        document.getElementById('job-postings-count').textContent = data.jobPostings || 0;
                        document.getElementById('applicants-count').textContent = data.totalApplicants || 0;
                        document.getElementById('applications-count').textContent = data.totalApplications || 0;
                        document.getElementById('interviews-today').textContent = data.interviewsToday || 0;
                        document.getElementById('avg-match-score').textContent = data.averageAIMatchScore ? Math.round(data.averageAIMatchScore) : 0;

                        // 단계별 현황
                        const stagesList = document.getElementById('stages-list');
                        stagesList.innerHTML = '';
                        
                        const stageColors = {
                            '서류전형': 'blue',
                            '1차면접': 'green',
                            '2차면접': 'purple',
                            '최종합격': 'yellow',
                            '불합격': 'red'
                        };

                        data.applicationsByStage.forEach(stage => {
                            const color = stageColors[stage.current_stage] || 'gray';
                            stagesList.innerHTML += \`
                                <div class="flex items-center justify-between p-3 bg-\${color}-50 rounded-lg">
                                    <span class="font-semibold text-\${color}-800">\${stage.current_stage}</span>
                                    <span class="bg-\${color}-200 text-\${color}-800 px-3 py-1 rounded-full text-sm font-bold">\${stage.count}명</span>
                                </div>
                            \`;
                        });

                        // 최근 지원자
                        const recentList = document.getElementById('recent-applications');
                        recentList.innerHTML = '';
                        
                        data.recentApplications.forEach(app => {
                            const statusColor = app.status === 'offer' ? 'green' : app.status === 'rejected' ? 'red' : 'blue';
                            recentList.innerHTML += \`
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="font-medium text-gray-900">\${app.name}</div>
                                        <div class="text-sm text-gray-500">\${app.email}</div>
                                    </td>
                                    <td class="px-6 py-4">\${app.job_title}</td>
                                    <td class="px-6 py-4">\${app.company}</td>
                                    <td class="px-6 py-4">\${app.total_experience_years}년</td>
                                    <td class="px-6 py-4">
                                        <span class="font-bold text-blue-600">\${app.ai_match_score ? Math.round(app.ai_match_score) : '-'}</span>
                                    </td>
                                    <td class="px-6 py-4">
                                        <span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-\${statusColor}-100 text-\${statusColor}-800">
                                            \${app.current_stage}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-sm text-gray-500">\${new Date(app.applied_at).toLocaleDateString('ko-KR')}</td>
                                </tr>
                            \`;
                        });
                    }
                } catch (error) {
                    console.error('Error loading dashboard:', error);
                }
            }

            // 지원자 목록 로드
            async function loadApplications() {
                try {
                    const status = document.getElementById('filter-status').value;
                    const stage = document.getElementById('filter-stage').value;
                    const sortBy = document.getElementById('sort-by').value;

                    let url = '/api/applications?order=DESC';
                    if (status) url += '&status=' + status;
                    if (stage) url += '&stage=' + encodeURIComponent(stage);
                    url += '&sort_by=' + sortBy;

                    const response = await fetch(url);
                    const result = await response.json();

                    if (result.success) {
                        const list = document.getElementById('applications-list');
                        list.innerHTML = '';

                        result.data.forEach(app => {
                            const statusColor = app.status === 'offer' ? 'green' : app.status === 'rejected' ? 'red' : 'blue';
                            list.innerHTML += \`
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="font-medium text-gray-900">\${app.name}</div>
                                    </td>
                                    <td class="px-6 py-4 text-sm text-gray-500">\${app.phone}</td>
                                    <td class="px-6 py-4 text-sm text-gray-500">\${app.education_level || '-'} / \${app.university || '-'}</td>
                                    <td class="px-6 py-4 text-sm text-gray-500">\${app.total_experience_years}년</td>
                                    <td class="px-6 py-4 text-sm text-gray-500">\${app.job_title}</td>
                                    <td class="px-6 py-4">
                                        <span class="font-bold text-blue-600">\${app.ai_match_score ? Math.round(app.ai_match_score) : '-'}</span>
                                    </td>
                                    <td class="px-6 py-4">
                                        <span class="font-bold text-green-600">\${app.screening_score ? Math.round(app.screening_score) : '-'}</span>
                                    </td>
                                    <td class="px-6 py-4">
                                        <span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                            \${app.current_stage}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4">
                                        <span class="px-2 py-1 text-xs font-semibold rounded-full bg-\${statusColor}-100 text-\${statusColor}-800">
                                            \${app.status}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4">
                                        <button onclick="viewApplication(\${app.id})" class="text-blue-600 hover:text-blue-800">
                                            <i class="fas fa-eye"></i> 상세
                                        </button>
                                    </td>
                                </tr>
                            \`;
                        });
                    }
                } catch (error) {
                    console.error('Error loading applications:', error);
                }
            }

            // 통계 분석 로드
            async function loadAnalytics() {
                try {
                    // 채용 퍼널 데이터
                    const funnelResponse = await fetch('/api/analytics/funnel');
                    const funnelResult = await funnelResponse.json();

                    if (funnelResult.success) {
                        const labels = funnelResult.data.funnel.map(item => {
                            const statusMap = {
                                'submitted': '제출됨',
                                'screening': '서류전형',
                                'interview': '면접',
                                'offer': '제안',
                                'hired': '채용완료',
                                'rejected': '불합격'
                            };
                            return statusMap[item.status] || item.status;
                        });
                        const counts = funnelResult.data.funnel.map(item => item.count);

                        // 차트 그리기
                        const ctx = document.getElementById('funnelChart');
                        if (funnelChart) {
                            funnelChart.destroy();
                        }

                        funnelChart = new Chart(ctx, {
                            type: 'bar',
                            data: {
                                labels: labels,
                                datasets: [{
                                    label: '지원자 수',
                                    data: counts,
                                    backgroundColor: [
                                        'rgba(59, 130, 246, 0.7)',
                                        'rgba(16, 185, 129, 0.7)',
                                        'rgba(139, 92, 246, 0.7)',
                                        'rgba(251, 191, 36, 0.7)',
                                        'rgba(34, 197, 94, 0.7)',
                                        'rgba(239, 68, 68, 0.7)'
                                    ],
                                    borderColor: [
                                        'rgb(59, 130, 246)',
                                        'rgb(16, 185, 129)',
                                        'rgb(139, 92, 246)',
                                        'rgb(251, 191, 36)',
                                        'rgb(34, 197, 94)',
                                        'rgb(239, 68, 68)'
                                    ],
                                    borderWidth: 2
                                }]
                            },
                            options: {
                                responsive: true,
                                plugins: {
                                    legend: {
                                        display: false
                                    }
                                },
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        ticks: {
                                            stepSize: 1
                                        }
                                    }
                                }
                            }
                        });
                    }

                    // 채용공고별 통계
                    const jobStatsResponse = await fetch('/api/analytics/by-job-posting');
                    const jobStatsResult = await jobStatsResponse.json();

                    if (jobStatsResult.success) {
                        const list = document.getElementById('job-stats-list');
                        list.innerHTML = '';

                        jobStatsResult.data.forEach(job => {
                            list.innerHTML += \`
                                <tr>
                                    <td class="px-6 py-4 font-medium text-gray-900">\${job.title}</td>
                                    <td class="px-6 py-4 text-sm text-gray-500">\${job.company}</td>
                                    <td class="px-6 py-4 text-sm text-gray-500">\${job.department}</td>
                                    <td class="px-6 py-4 font-semibold text-blue-600">\${job.total_applications || 0}명</td>
                                    <td class="px-6 py-4 font-semibold text-purple-600">\${job.avg_match_score ? Math.round(job.avg_match_score) : '-'}</td>
                                    <td class="px-6 py-4 font-semibold text-green-600">\${job.offers || 0}명</td>
                                    <td class="px-6 py-4 font-semibold text-red-600">\${job.rejections || 0}명</td>
                                </tr>
                            \`;
                        });
                    }
                } catch (error) {
                    console.error('Error loading analytics:', error);
                }
            }

            // 지원자 상세 보기
            function viewApplication(id) {
                alert('지원자 상세보기 기능은 개발 중입니다. ID: ' + id);
                // TODO: 모달 또는 별도 페이지로 상세 정보 표시
            }

            // =====================================================
            // 이력서 업로드 관련 함수
            // =====================================================

            // 채용공고 목록 로드 (업로드 폼용)
            async function loadJobPostingsForUpload() {
                try {
                    const response = await fetch('/api/job-postings?status=open');
                    const result = await response.json();

                    if (result.success) {
                        const select = document.getElementById('upload-job-posting');
                        select.innerHTML = '<option value="">채용공고를 선택하세요</option>';
                        
                        result.data.forEach(job => {
                            const option = document.createElement('option');
                            option.value = job.id;
                            option.textContent = \`\${job.title} - \${job.company} (\${job.department})\`;
                            select.appendChild(option);
                        });
                    }
                } catch (error) {
                    console.error('Error loading job postings:', error);
                }
            }

            // 이력서 업로드 폼 제출
            document.addEventListener('DOMContentLoaded', () => {
                const uploadForm = document.getElementById('resume-upload-form');
                if (uploadForm) {
                    uploadForm.addEventListener('submit', async (e) => {
                        e.preventDefault();

                        const formData = new FormData();
                        formData.append('job_posting_id', document.getElementById('upload-job-posting').value);
                        formData.append('name', document.getElementById('upload-name').value);
                        formData.append('email', document.getElementById('upload-email').value);
                        formData.append('phone', document.getElementById('upload-phone').value);
                        formData.append('birth_date', document.getElementById('upload-birth-date').value);
                        formData.append('gender', document.getElementById('upload-gender').value);
                        formData.append('resume_text', document.getElementById('upload-resume-text').value);
                        formData.append('cover_letter', document.getElementById('upload-cover-letter').value);

                        try {
                            const response = await fetch('/api/applicants/upload-resume', {
                                method: 'POST',
                                body: formData
                            });

                            const result = await response.json();

                            if (result.success) {
                                // 분석 결과 표시
                                document.getElementById('result-score').textContent = Math.round(result.data.ai_match_score) + '점';
                                document.getElementById('result-experience').textContent = result.data.analysis.total_experience_years + '년';
                                document.getElementById('result-education').textContent = result.data.analysis.education_level;
                                document.getElementById('result-reason').textContent = result.data.ai_match_reason;

                                // 결과 창 표시
                                document.getElementById('upload-result').classList.remove('hidden');
                                
                                // 폼 스크롤
                                document.getElementById('upload-result').scrollIntoView({ behavior: 'smooth' });
                            } else {
                                alert('오류: ' + result.error);
                            }
                        } catch (error) {
                            console.error('Error uploading resume:', error);
                            alert('이력서 업로드 중 오류가 발생했습니다.');
                        }
                    });
                }
            });

            // =====================================================
            // 이메일 관리 관련 함수
            // =====================================================

            // 이메일 목록 로드
            async function loadEmails() {
                try {
                    const status = document.getElementById('email-filter-status').value;
                    const type = document.getElementById('email-filter-type').value;

                    let url = '/api/emails?';
                    if (status) url += 'status=' + status + '&';
                    if (type) url += 'type=' + type;

                    const response = await fetch(url);
                    const result = await response.json();

                    if (result.success) {
                        // 통계 업데이트
                        const sentCount = result.data.filter(e => e.status === 'sent').length;
                        const pendingCount = result.data.filter(e => e.status === 'pending').length;
                        const failedCount = result.data.filter(e => e.status === 'failed').length;

                        document.getElementById('email-sent-count').textContent = sentCount;
                        document.getElementById('email-pending-count').textContent = pendingCount;
                        document.getElementById('email-failed-count').textContent = failedCount;
                        document.getElementById('email-total-count').textContent = result.data.length;

                        // 이메일 목록 표시
                        const list = document.getElementById('emails-list');
                        list.innerHTML = '';

                        const emailTypeMap = {
                            'application_received': '지원서 접수',
                            'interview_scheduled': '면접 안내',
                            'offer': '합격 통보',
                            'rejection': '불합격 안내'
                        };

                        result.data.forEach(email => {
                            const statusColor = email.status === 'sent' ? 'green' : email.status === 'pending' ? 'yellow' : 'red';
                            const statusText = email.status === 'sent' ? '발송완료' : email.status === 'pending' ? '대기중' : '실패';

                            list.innerHTML += \`
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="font-medium text-gray-900">\${email.recipient_name}</div>
                                    </td>
                                    <td class="px-6 py-4 text-sm text-gray-500">\${email.recipient_email}</td>
                                    <td class="px-6 py-4 text-sm text-gray-500">\${emailTypeMap[email.email_type] || email.email_type}</td>
                                    <td class="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">\${email.subject}</td>
                                    <td class="px-6 py-4">
                                        <span class="px-3 py-1 text-xs font-semibold rounded-full bg-\${statusColor}-100 text-\${statusColor}-800">
                                            \${statusText}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-sm text-gray-500">\${email.sent_at ? new Date(email.sent_at).toLocaleString('ko-KR') : '-'}</td>
                                    <td class="px-6 py-4">
                                        \${email.status === 'pending' ? \`
                                            <button onclick="resendEmail(\${email.id})" class="text-blue-600 hover:text-blue-800">
                                                <i class="fas fa-redo"></i> 재발송
                                            </button>
                                        \` : ''}
                                    </td>
                                </tr>
                            \`;
                        });
                    }
                } catch (error) {
                    console.error('Error loading emails:', error);
                }
            }

            // 이메일 발송 폼 제출
            document.addEventListener('DOMContentLoaded', () => {
                const emailForm = document.getElementById('email-send-form');
                if (emailForm) {
                    emailForm.addEventListener('submit', async (e) => {
                        e.preventDefault();

                        const data = {
                            recipient_email: document.getElementById('email-recipient').value,
                            recipient_name: document.getElementById('email-recipient-name').value,
                            email_type: document.getElementById('email-type').value,
                            subject: document.getElementById('email-subject').value,
                            body: document.getElementById('email-body').value
                        };

                        try {
                            const response = await fetch('/api/emails/send', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(data)
                            });

                            const result = await response.json();

                            if (result.success) {
                                alert('이메일이 발송되었습니다!\\n\\n' + result.message);
                                emailForm.reset();
                                loadEmails();
                            } else {
                                alert('오류: ' + result.error);
                            }
                        } catch (error) {
                            console.error('Error sending email:', error);
                            alert('이메일 발송 중 오류가 발생했습니다.');
                        }
                    });
                }

                // 이메일 유형 선택 시 템플릿 자동 입력
                const emailTypeSelect = document.getElementById('email-type');
                if (emailTypeSelect) {
                    emailTypeSelect.addEventListener('change', (e) => {
                        const templates = {
                            'application_received': {
                                subject: '[ATS] 지원서 접수 완료',
                                body: '안녕하세요 [이름]님,\\n\\n지원서가 정상적으로 접수되었습니다.\\n서류 전형 결과는 일주일 내 안내드리겠습니다.\\n\\n감사합니다.\\n인사팀'
                            },
                            'interview_scheduled': {
                                subject: '[ATS] 면접 일정 안내',
                                body: '안녕하세요 [이름]님,\\n\\n서류 전형 합격을 축하드립니다!\\n\\n면접 일정: [날짜] [시간]\\n면접 장소: [장소]\\n\\n준비물: 신분증, 이력서 1부\\n\\n감사합니다.\\n인사팀'
                            },
                            'offer': {
                                subject: '[ATS] 최종 합격 통보',
                                body: '안녕하세요 [이름]님,\\n\\n최종 합격을 축하드립니다!\\n\\n채용 조건은 별도로 안내드릴 예정이며,\\n입사 의사를 2주 내 회신 부탁드립니다.\\n\\n감사합니다.\\n인사팀'
                            },
                            'rejection': {
                                subject: '[ATS] 전형 결과 안내',
                                body: '안녕하세요 [이름]님,\\n\\n아쉽게도 이번 전형에서는 귀하를 선발하지 못했습니다.\\n향후 다른 기회에 다시 뵙기를 바랍니다.\\n\\n감사합니다.\\n인사팀'
                            }
                        };

                        const template = templates[e.target.value];
                        if (template) {
                            document.getElementById('email-subject').value = template.subject;
                            document.getElementById('email-body').value = template.body;
                        }
                    });
                }
            });

            // 이메일 재발송
            async function resendEmail(id) {
                try {
                    const response = await fetch(\`/api/emails/\${id}/status\`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'sent' })
                    });

                    const result = await response.json();

                    if (result.success) {
                        alert('이메일이 재발송되었습니다.');
                        loadEmails();
                    } else {
                        alert('오류: ' + result.error);
                    }
                } catch (error) {
                    console.error('Error resending email:', error);
                }
            }

            // 페이지 로드 시 대시보드 표시
            window.addEventListener('DOMContentLoaded', () => {
                showTab('dashboard');
            });
        </script>
    </body>
    </html>
  `)
})

export default app
