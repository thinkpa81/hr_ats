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
        <title>코아시아 ATS - 지능형 채용관리 시스템</title>
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
                        <span class="text-xl font-bold">코아시아 ATS</span>
                    </div>
                    <div class="flex items-center space-x-6">
                        <a href="#" onclick="showTab('dashboard')" class="nav-link hover:text-blue-200 transition"><i class="fas fa-chart-line mr-2"></i>대시보드</a>
                        <a href="#" onclick="showTab('applications')" class="nav-link hover:text-blue-200 transition"><i class="fas fa-users mr-2"></i>지원자 관리</a>
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
                } else if (tab === 'applications') {
                    loadApplications();
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
