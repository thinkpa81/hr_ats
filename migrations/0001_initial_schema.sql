-- =====================================================
-- ATS (Applicant Tracking System) Database Schema
-- 표준 채용 프로세스 통합 시스템
-- =====================================================

-- 1. 채용공고 (Job Postings)
CREATE TABLE IF NOT EXISTS job_postings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,                    -- 법인명 (지주사/계열사)
  department TEXT NOT NULL,                 -- 부서
  position_level TEXT NOT NULL,             -- 직급 (신입/경력/임원)
  employment_type TEXT NOT NULL,            -- 고용형태 (정규직/계약직/인턴)
  location TEXT NOT NULL,                   -- 근무지
  job_description TEXT NOT NULL,            -- 직무설명
  requirements TEXT NOT NULL,               -- 자격요건
  preferred_qualifications TEXT,            -- 우대사항
  salary_range TEXT,                        -- 급여범위
  benefits TEXT,                            -- 복리후생
  status TEXT NOT NULL DEFAULT 'open',      -- 상태 (open/closed/draft)
  deadline DATE,                            -- 마감일
  openings INTEGER DEFAULT 1,               -- 채용인원
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL                  -- 작성자 (HR 담당자)
);

-- 2. 지원자 (Applicants)
CREATE TABLE IF NOT EXISTS applicants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  birth_date DATE,
  gender TEXT,
  address TEXT,
  education_level TEXT,                     -- 최종학력
  university TEXT,                          -- 출신대학
  major TEXT,                               -- 전공
  graduation_date DATE,                     -- 졸업일
  total_experience_years INTEGER DEFAULT 0, -- 총 경력(년)
  current_company TEXT,                     -- 현직장
  current_position TEXT,                    -- 현직급
  resume_url TEXT,                          -- 이력서 파일 URL
  portfolio_url TEXT,                       -- 포트폴리오 URL
  linkedin_url TEXT,
  github_url TEXT,
  referral_source TEXT,                     -- 지원경로 (채용사이트/추천/헤드헌팅)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 지원내역 (Applications) - 지원자와 채용공고 연결
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_posting_id INTEGER NOT NULL,
  applicant_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',  -- submitted/screening/interview/offer/rejected/hired
  current_stage TEXT NOT NULL DEFAULT '서류전형', -- 현재 전형단계
  cover_letter TEXT,                         -- 자기소개서
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ai_match_score REAL,                       -- AI 매칭점수 (0-100)
  ai_match_reason TEXT,                      -- AI 매칭 이유
  screening_score REAL,                      -- 서류전형 점수
  screening_notes TEXT,                      -- 서류전형 메모
  final_decision TEXT,                       -- 최종결정 (합격/불합격/보류)
  final_decision_date DATETIME,
  final_decision_by TEXT,                    -- 최종결정자
  rejection_reason TEXT,                     -- 불합격 사유
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE CASCADE,
  FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE,
  UNIQUE(job_posting_id, applicant_id)       -- 중복지원 방지
);

-- 4. 면접일정 (Interviews)
CREATE TABLE IF NOT EXISTS interviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  interview_type TEXT NOT NULL,              -- 1차면접/2차면접/임원면접/PT면접
  interview_round INTEGER NOT NULL,          -- 면접차수
  interview_date DATETIME NOT NULL,
  interview_location TEXT,                   -- 면접장소 (온라인/오프라인)
  interview_method TEXT,                     -- 면접방식 (대면/화상/전화)
  interviewers TEXT,                         -- 면접관 (JSON 배열)
  duration_minutes INTEGER DEFAULT 60,       -- 면접시간(분)
  status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled/completed/cancelled/no_show
  notes TEXT,                                -- 면접 메모
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- 5. 면접평가 (Interview Evaluations)
CREATE TABLE IF NOT EXISTS interview_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  interview_id INTEGER NOT NULL,
  interviewer_name TEXT NOT NULL,            -- 면접관 이름
  interviewer_position TEXT NOT NULL,        -- 면접관 직급
  technical_score REAL,                      -- 기술역량 점수 (0-100)
  communication_score REAL,                  -- 의사소통 점수
  culture_fit_score REAL,                    -- 조직적합성 점수
  problem_solving_score REAL,                -- 문제해결 점수
  leadership_score REAL,                     -- 리더십 점수
  total_score REAL,                          -- 총점
  strengths TEXT,                            -- 강점
  weaknesses TEXT,                           -- 약점
  recommendation TEXT NOT NULL,              -- 추천의견 (적극추천/추천/보류/비추천)
  detailed_feedback TEXT,                    -- 상세 피드백
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE
);

-- 6. 평가항목 마스터 (Evaluation Criteria Master)
CREATE TABLE IF NOT EXISTS evaluation_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_posting_id INTEGER NOT NULL,
  criteria_name TEXT NOT NULL,               -- 평가항목명
  criteria_weight REAL NOT NULL,             -- 가중치 (%)
  description TEXT,                          -- 설명
  evaluation_type TEXT NOT NULL,             -- resume/interview/technical_test
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE CASCADE
);

-- 7. 채용프로세스 로그 (Recruitment Process Log)
CREATE TABLE IF NOT EXISTS process_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  stage TEXT NOT NULL,                       -- 프로세스 단계
  action TEXT NOT NULL,                      -- 수행된 액션
  performer TEXT NOT NULL,                   -- 수행자
  notes TEXT,                                -- 메모
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- 8. 이메일 알림 로그 (Email Notification Log)
CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  email_type TEXT NOT NULL,                  -- application_received/interview_scheduled/offer/rejection
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending/sent/failed
  sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. 통계 스냅샷 (Statistics Snapshot) - 대시보드용
CREATE TABLE IF NOT EXISTS statistics_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date DATE NOT NULL,
  total_job_postings INTEGER DEFAULT 0,
  active_job_postings INTEGER DEFAULT 0,
  total_applicants INTEGER DEFAULT 0,
  total_applications INTEGER DEFAULT 0,
  applications_by_status TEXT,               -- JSON: {submitted: 10, screening: 5, ...}
  average_time_to_hire REAL,                 -- 평균 채용기간(일)
  application_conversion_rate REAL,          -- 지원 → 채용 전환율(%)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snapshot_date)
);

-- =====================================================
-- 인덱스 생성 (성능 최적화)
-- =====================================================

-- 채용공고 인덱스
CREATE INDEX IF NOT EXISTS idx_job_postings_status ON job_postings(status);
CREATE INDEX IF NOT EXISTS idx_job_postings_company ON job_postings(company);
CREATE INDEX IF NOT EXISTS idx_job_postings_created_at ON job_postings(created_at DESC);

-- 지원자 인덱스
CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);
CREATE INDEX IF NOT EXISTS idx_applicants_created_at ON applicants(created_at DESC);

-- 지원내역 인덱스
CREATE INDEX IF NOT EXISTS idx_applications_job_posting ON applications(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_current_stage ON applications(current_stage);
CREATE INDEX IF NOT EXISTS idx_applications_ai_score ON applications(ai_match_score DESC);

-- 면접 인덱스
CREATE INDEX IF NOT EXISTS idx_interviews_application ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_date ON interviews(interview_date);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews(status);

-- 면접평가 인덱스
CREATE INDEX IF NOT EXISTS idx_evaluations_interview ON interview_evaluations(interview_id);

-- 프로세스 로그 인덱스
CREATE INDEX IF NOT EXISTS idx_process_logs_application ON process_logs(application_id);
CREATE INDEX IF NOT EXISTS idx_process_logs_created_at ON process_logs(created_at DESC);

-- 이메일 로그 인덱스
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);

-- 통계 인덱스
CREATE INDEX IF NOT EXISTS idx_statistics_date ON statistics_snapshot(snapshot_date DESC);
