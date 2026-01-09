-- =====================================================
-- ATS 시스템 초기 데이터 (Seed Data)
-- 표준 채용 프로세스 테스트 데이터
-- =====================================================

-- 1. 채용공고 샘플 데이터
INSERT INTO job_postings (title, company, department, position_level, employment_type, location, job_description, requirements, preferred_qualifications, salary_range, benefits, status, deadline, openings, created_by) VALUES
('AI 연구원 (머신러닝/딥러닝)', 'Tech Company', 'AI연구소', '경력', '정규직', '서울 강남구', 
'AI/ML 모델 개발 및 최적화, 딥러닝 알고리즘 연구, 데이터 분석 및 전처리',
'AI/ML 관련 석사 이상, Python/TensorFlow/PyTorch 능숙, 3년 이상 실무 경험',
'국제 학술지 논문 게재, Kaggle 수상 경력, NLP/Computer Vision 프로젝트 경험',
'연봉 6,000만원 ~ 9,000만원 (경력에 따라 협의)',
'4대보험, 연차 15일, 자기계발비 지원, 재택근무 주 2회',
'open', '2026-02-28', 2, 'hr-manager@coasia.com'),

('인사기획 담당자 (HR Planning)', 'Tech Company', '경영지원본부 인사팀', '신입/경력', '정규직', '서울 서초구',
'채용 전략 수립 및 실행, HR 프로세스 개선, 인사 데이터 분석 및 리포팅, 조직문화 프로그램 기획',
'인사/경영 관련 학사 이상, HR 실무 경험 우대, Excel/PowerPoint 능숙',
'HRBP 자격증, 노무사 자격증, 채용 프로젝트 리딩 경험',
'신입 연봉 4,000만원 ~ 4,500만원, 경력 5,000만원 ~ 7,000만원',
'4대보험, 연차 15일, 교육비 지원, 경조사 지원',
'open', '2026-02-15', 1, 'hr-manager@coasia.com'),

('풀스택 개발자 (Full-Stack Developer)', 'Technology', '개발본부', '경력', '정규직', '판교 테크노밸리',
'웹/모바일 서비스 개발, 프론트엔드(React/Vue) 및 백엔드(Node.js/Python) 개발, API 설계 및 구현, 데이터베이스 설계',
'컴퓨터공학 학사 이상, 3년 이상 풀스택 개발 경험, JavaScript/TypeScript 능숙, RDBMS 경험',
'클라우드(AWS/GCP/Azure) 운영 경험, Docker/Kubernetes 경험, 대용량 트래픽 처리 경험',
'연봉 5,500만원 ~ 8,500만원',
'4대보험, 연차 15일, 스톡옵션, 자율 출퇴근제',
'open', '2026-03-31', 3, 'hr@coasia-tech.com'),

('재무 분석가 (Financial Analyst)', 'Investment', '재무전략팀', '경력', '정규직', '서울 여의도',
'재무제표 분석, 투자 의사결정 지원, 재무 모델링, 실적 예측 및 리포팅',
'경영/경제/회계 학사 이상, 3년 이상 재무 분석 경험, Excel 고급 활용, 재무회계 지식',
'CFA/CPA 자격증, 증권사/IB 경력, 영어 능통',
'연봉 6,000만원 ~ 8,000만원',
'4대보험, 연차 15일, 성과급, 사내식당',
'open', '2026-02-20', 2, 'hr@coasia-inv.com'),

('제조기술 엔지니어 (Manufacturing Engineer)', 'Manufacturing', '생산기술부', '경력', '정규직', '경기 화성',
'생산라인 설계 및 개선, 공정 최적화, 품질 관리, 불량률 감소 프로젝트 수행',
'기계공학/산업공학 학사 이상, 3년 이상 제조 현장 경험, CAD/CAM 능숙',
'6시그마 자격증, 스마트팩토리 구축 경험, PLC 프로그래밍',
'연봉 5,000만원 ~ 7,000만원',
'4대보험, 연차 15일, 기숙사 제공, 통근버스',
'open', '2026-03-15', 1, 'hr@coasia-mfg.com');

-- 2. 지원자 샘플 데이터
INSERT INTO applicants (name, email, phone, birth_date, gender, education_level, university, major, graduation_date, total_experience_years, current_company, current_position, referral_source) VALUES
('김민준', 'minjun.kim@email.com', '010-1234-5678', '1992-03-15', '남', '석사', '서울대학교', 'AI융합학과', '2020-02-28', 4, 'NAVER AI Lab', '선임연구원', '채용사이트'),
('이서연', 'seoyeon.lee@email.com', '010-2345-6789', '1995-07-22', '여', '학사', '연세대학교', '경영학과', '2019-02-28', 3, 'SK하이닉스', 'HR담당', '추천'),
('박지훈', 'jihoon.park@email.com', '010-3456-7890', '1990-11-08', '남', '학사', '카이스트', '전산학과', '2016-02-28', 7, '카카오', '시니어개발자', '헤드헌팅'),
('최유진', 'yujin.choi@email.com', '010-4567-8901', '1994-05-30', '여', '석사', '고려대학교', '경제학과', '2021-08-31', 3, '삼성증권', '애널리스트', '채용사이트'),
('정현우', 'hyunwoo.jung@email.com', '010-5678-9012', '1993-09-18', '남', '학사', '성균관대', '기계공학과', '2018-02-28', 5, '현대자동차', '제조기술', '채용사이트'),
('강예진', 'yejin.kang@email.com', '010-6789-0123', '1996-01-25', '여', '학사', '이화여대', '경영학과', '2020-02-28', 2, 'LG전자', 'HR인턴', '채용사이트'),
('윤도현', 'dohyun.yoon@email.com', '010-7890-1234', '1991-12-03', '남', '박사', 'MIT', 'Computer Science', '2019-05-30', 5, 'Google AI', '연구원', '헤드헌팅'),
('한소희', 'sohee.han@email.com', '010-8901-2345', '1995-04-12', '여', '학사', '부산대학교', '산업공학과', '2019-02-28', 3, '포스코', '생산관리', '채용사이트');

-- 3. 지원내역 샘플 데이터 (지원자와 채용공고 매칭)
INSERT INTO applications (job_posting_id, applicant_id, status, current_stage, cover_letter, ai_match_score, ai_match_reason, screening_score) VALUES
(1, 1, 'interview', '2차면접', 'AI 연구 열정과 실무 경험을 바탕으로 AI연구소에 기여하고 싶습니다.', 95.5, 'AI/ML 석사학위, NAVER AI Lab 4년 경력, 논문 3편 게재, 기술스택 완벽 매칭', 92.0),
(1, 7, 'interview', '1차면접', 'MIT 박사 학위와 Google AI 경험을 통해 세계 수준의 AI 연구를 수행하겠습니다.', 98.2, 'MIT 박사, Google AI 5년 경력, 국제학술지 10편 이상, 딥러닝 전문가', 95.0),
(2, 2, 'screening', '서류전형', '3년간 HR 실무 경험을 바탕으로 채용 프로세스 혁신에 기여하고 싶습니다.', 88.3, 'HR 실무 3년, 경영학 전공, 채용 프로젝트 다수 수행', 85.0),
(2, 6, 'rejected', '서류전형', '인사 업무에 관심이 많아 지원하게 되었습니다.', 65.5, '경력 2년으로 다소 부족, 인턴 경험 위주', 70.0),
(3, 3, 'offer', '최종합격', '7년간 풀스택 개발 경험으로 회사 성장에 기여하겠습니다.', 94.7, '카카오 시니어 개발자 7년, 풀스택 전문, 대용량 트래픽 경험 풍부', 93.0),
(4, 4, 'interview', '1차면접', '삼성증권 애널리스트로서 재무 분석 전문성을 발휘하겠습니다.', 91.2, '증권사 애널리스트 3년, 고려대 경제학 석사, 재무모델링 전문', 88.0),
(5, 5, 'screening', '서류전형', '현대자동차 5년 경력으로 제조 혁신을 이끌겠습니다.', 87.5, '제조기술 5년 경력, 기계공학 전공, 현장 경험 풍부', 82.0),
(5, 8, 'submitted', '서류전형', '산업공학 전공과 포스코 경험으로 생산성 향상에 기여하겠습니다.', 80.3, '산업공학 전공, 생산관리 3년, 공정 최적화 경험', 0);

-- 4. 면접일정 샘플 데이터
INSERT INTO interviews (application_id, interview_type, interview_round, interview_date, interview_location, interview_method, interviewers, duration_minutes, status) VALUES
(1, '1차 기술면접', 1, '2026-01-15 14:00:00', '본사 7층 회의실', '대면', '["김철수 연구소장", "이영희 팀장"]', 60, 'completed'),
(1, '2차 임원면접', 2, '2026-01-22 10:00:00', '본사 임원회의실', '대면', '["박영수 CTO", "최민정 부사장"]', 90, 'scheduled'),
(2, '1차 실무면접', 1, '2026-01-18 15:00:00', '온라인 (Zoom)', '화상', '["윤도현 AI Lab 연구원", "한소희 선임연구원"]', 60, 'scheduled'),
(4, '1차 실무면접', 1, '2026-01-20 11:00:00', '본사 3층 회의실', '대면', '["장순호 인사기획부장", "김민지 팀장"]', 60, 'scheduled'),
(6, '1차 기술면접', 1, '2026-01-16 16:00:00', '본사', '대면', '["정재무 팀장", "오회계 과장"]', 60, 'completed');

-- 5. 면접평가 샘플 데이터
INSERT INTO interview_evaluations (interview_id, interviewer_name, interviewer_position, technical_score, communication_score, culture_fit_score, problem_solving_score, leadership_score, total_score, strengths, weaknesses, recommendation, detailed_feedback) VALUES
(1, '김철수', '연구소장', 95.0, 90.0, 88.0, 92.0, 85.0, 90.0, 
'AI/ML 이론과 실무 경험이 탁월함. NAVER AI Lab에서의 프로젝트 경험이 풍부하고 최신 기술 트렌드를 잘 파악하고 있음.',
'리더십 경험이 다소 부족함. 팀 리딩보다는 개인 연구 중심의 경력.',
'적극추천',
'기술적 역량이 매우 우수하며, 연구소의 핵심 인재로 성장할 가능성이 높음. 2차 면접 진행 추천.'),

(1, '이영희', '팀장', 92.0, 88.0, 90.0, 90.0, 82.0, 88.4,
'논문 게재 실적이 우수하고 실무 적용 능력이 뛰어남. 코드 품질이 높음.',
'발표 능력을 더 개선하면 좋을 것 같음.',
'추천',
'실무 투입 시 즉시 성과를 낼 수 있을 것으로 판단됨.'),

(5, '정재무', '팀장', 88.0, 85.0, 87.0, 86.0, 84.0, 86.0,
'재무 분석 역량이 우수하고 증권사 경험이 풍부함. Excel 모델링 능력 탁월.',
'투자 전략 수립 경험이 다소 부족함.',
'추천',
'재무 분석 실무에 즉시 투입 가능. 추가 면접 후 최종 결정 권장.');

-- 6. 평가항목 마스터 (채용공고별)
INSERT INTO evaluation_criteria (job_posting_id, criteria_name, criteria_weight, description, evaluation_type) VALUES
(1, 'AI/ML 기술역량', 40.0, '딥러닝, 머신러닝 알고리즘 이해 및 구현 능력', 'interview'),
(1, '연구 실적', 25.0, '논문 게재, 학술 활동, 프로젝트 수행 경험', 'resume'),
(1, '문제해결 능력', 20.0, '복잡한 문제를 분석하고 창의적 해결책 제시', 'interview'),
(1, '커뮤니케이션', 15.0, '연구 결과 발표 및 협업 능력', 'interview'),

(2, 'HR 실무 경험', 35.0, '채용, 평가, 교육, 조직문화 등 HR 전반 경험', 'resume'),
(2, '데이터 분석 능력', 25.0, 'Excel, HRIS 활용, HR 데이터 분석 및 리포팅', 'interview'),
(2, '기획력', 25.0, 'HR 프로세스 개선, 프로젝트 기획 및 실행', 'interview'),
(2, '커뮤니케이션', 15.0, '이해관계자 협업, 설득 및 조율 능력', 'interview'),

(3, '풀스택 개발 역량', 40.0, '프론트엔드 및 백엔드 개발 능숙도', 'technical_test'),
(3, '프로젝트 경험', 30.0, '실무 프로젝트 수행 경험 및 성과', 'resume'),
(3, '문제해결 능력', 20.0, '알고리즘, 아키텍처 설계 능력', 'technical_test'),
(3, '협업 능력', 10.0, '팀워크, 코드리뷰, 커뮤니케이션', 'interview');

-- 7. 프로세스 로그 샘플
INSERT INTO process_logs (application_id, stage, action, performer, notes) VALUES
(1, '서류전형', '지원서 접수', 'system', '온라인 지원서 자동 접수'),
(1, '서류전형', 'AI 매칭 완료', 'system', 'AI 매칭점수: 95.5점'),
(1, '서류전형', '서류 합격 처리', 'hr-manager@coasia.com', '기술역량 우수, 1차 면접 진행'),
(1, '1차면접', '면접 일정 확정', 'hr-manager@coasia.com', '2026-01-15 14:00 면접 일정 통보'),
(1, '1차면접', '면접 완료', 'system', '면접관 2명 평가 완료, 평균 89.2점'),
(1, '2차면접', '2차 면접 일정 확정', 'hr-manager@coasia.com', '2026-01-22 10:00 임원면접 예정'),

(5, '서류전형', '지원서 접수', 'system', '온라인 지원서 자동 접수'),
(5, '서류전형', 'AI 매칭 완료', 'system', 'AI 매칭점수: 94.7점'),
(5, '서류전형', '서류 합격', 'hr@coasia-tech.com', '풀스택 경력 우수'),
(5, '1차면접', '면접 완료', 'system', '기술면접 통과'),
(5, '2차면접', '면접 완료', 'system', '임원면접 통과'),
(5, '최종합격', '채용 제안', 'hr@coasia-tech.com', '연봉 8,500만원 제안, 입사일 협의 중');

-- 8. 이메일 로그 샘플
INSERT INTO email_logs (recipient_email, recipient_name, email_type, subject, body, status, sent_at) VALUES
('minjun.kim@email.com', '김민준', 'application_received', '[ATS] 지원서 접수 완료', '안녕하세요 김민준님, AI 연구원 직무에 지원해 주셔서 감사합니다. 서류 전형 결과는 일주일 내 안내드리겠습니다.', 'sent', '2026-01-08 10:30:00'),
('minjun.kim@email.com', '김민준', 'interview_scheduled', '[ATS] 1차 면접 일정 안내', '서류 전형 합격을 축하드립니다. 1차 면접은 2026-01-15 14:00에 본사 7층 회의실에서 진행됩니다.', 'sent', '2026-01-10 15:20:00'),
('jihoon.park@email.com', '박지훈', 'offer', '[ATS] 채용 제안', '최종 합격을 축하드립니다! 연봉 8,500만원으로 채용 제안을 드립니다. 입사 의사를 2주 내 회신 부탁드립니다.', 'sent', '2026-01-05 11:00:00'),
('yejin.kang@email.com', '강예진', 'rejection', '[ATS] 전형 결과 안내', '안녕하세요 강예진님, 서류 전형 결과를 안내드립니다. 아쉽게도 이번 전형에서는 귀하를 선발하지 못했습니다. 향후 다른 기회에 다시 뵙기를 바랍니다.', 'sent', '2026-01-07 16:45:00');

-- 9. 통계 스냅샷 초기 데이터
INSERT INTO statistics_snapshot (snapshot_date, total_job_postings, active_job_postings, total_applicants, total_applications, applications_by_status, average_time_to_hire, application_conversion_rate) VALUES
('2026-01-01', 5, 5, 8, 8, '{"submitted": 1, "screening": 2, "interview": 3, "offer": 1, "rejected": 1}', 14.5, 12.5);
