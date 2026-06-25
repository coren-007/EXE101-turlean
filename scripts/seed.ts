// Seed data for TutorConnect platform - expanded subjects (all grades) + multiple cities
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

// Locations across Vietnam
const LOCATIONS = [
  // Hanoi
  { city: 'Hà Nội', district: 'Cầu Giấy', lat: 21.0365, lng: 105.7890 },
  { city: 'Hà Nội', district: 'Ba Đình', lat: 21.0433, lng: 105.8150 },
  { city: 'Hà Nội', district: 'Hoàn Kiếm', lat: 21.0285, lng: 105.8542 },
  { city: 'Hà Nội', district: 'Đống Đa', lat: 21.0200, lng: 105.8300 },
  { city: 'Hà Nội', district: 'Hai Bà Trưng', lat: 21.0050, lng: 105.8500 },
  { city: 'Hà Nội', district: 'Tây Hồ', lat: 21.0720, lng: 105.8300 },
  { city: 'Hà Nội', district: 'Thanh Xuân', lat: 20.9980, lng: 105.8100 },
  { city: 'Hà Nội', district: 'Hoàng Mai', lat: 20.9800, lng: 105.8500 },
  { city: 'Hà Nội', district: 'Long Biên', lat: 21.0430, lng: 105.8900 },
  { city: 'Hà Nội', district: 'Nam Từ Liêm', lat: 21.0200, lng: 105.7600 },
  // Ho Chi Minh City
  { city: 'TP.HCM', district: 'Quận 1', lat: 10.7756, lng: 106.7004 },
  { city: 'TP.HCM', district: 'Quận 3', lat: 10.7822, lng: 106.6900 },
  { city: 'TP.HCM', district: 'Quận 5', lat: 10.7522, lng: 106.6670 },
  { city: 'TP.HCM', district: 'Quận 7', lat: 10.7350, lng: 106.7217 },
  { city: 'TP.HCM', district: 'Quận 10', lat: 10.7731, lng: 106.6636 },
  { city: 'TP.HCM', district: 'Quận Bình Thạnh', lat: 10.8000, lng: 106.7100 },
  { city: 'TP.HCM', district: 'Quận Phú Nhuận', lat: 10.8000, lng: 106.6700 },
  { city: 'TP.HCM', district: 'Thành phố Thủ Đức', lat: 10.8500, lng: 106.7500 },
  { city: 'TP.HCM', district: 'Quận Tân Bình', lat: 10.8000, lng: 106.6500 },
  { city: 'TP.HCM', district: 'Quận Gò Vấp', lat: 10.8300, lng: 106.6700 },
  // Da Nang
  { city: 'Đà Nẵng', district: 'Hải Châu', lat: 16.0609, lng: 108.2230 },
  { city: 'Đà Nẵng', district: 'Thanh Khê', lat: 16.0500, lng: 108.1900 },
  { city: 'Đà Nẵng', district: 'Sơn Trà', lat: 16.1100, lng: 108.2900 },
  { city: 'Đà Nẵng', district: 'Ngũ Hành Sơn', lat: 16.0000, lng: 108.2600 },
  { city: 'Đà Nẵng', district: 'Cẩm Lệ', lat: 15.9900, lng: 108.2200 },
  // Hai Phong
  { city: 'Hải Phòng', district: 'Lê Chân', lat: 20.8400, lng: 106.6900 },
  { city: 'Hải Phòng', district: 'Ngô Quyền', lat: 20.8600, lng: 106.7000 },
  { city: 'Hải Phòng', district: 'Hồng Bàng', lat: 20.8600, lng: 106.6300 },
  { city: 'Hải Phòng', district: 'Kiến An', lat: 20.8100, lng: 106.6400 },
  // Can Tho
  { city: 'Cần Thơ', district: 'Ninh Kiều', lat: 10.0300, lng: 105.7700 },
  { city: 'Cần Thơ', district: 'Bình Thủy', lat: 10.0700, lng: 105.7300 },
  { city: 'Cần Thơ', district: 'Cái Răng', lat: 9.9900, lng: 105.7700 },
]

// Subjects - organized by school level + category
// PRIMARY = cấp 1, SECONDARY = cấp 2, HIGH = cấp 3
const SUBJECTS = [
  // STEM - Primary school
  { name: 'Toán Tiểu học', slug: 'toan-tieu-hoc', category: 'STEM', icon: 'Calculator', level: 'PRIMARY' },
  { name: 'Tiếng Việt Tiểu học', slug: 'tieng-viet-tieu-hoc', category: 'STEM', icon: 'BookOpen', level: 'PRIMARY' },
  { name: 'Tự nhiên & Xã hội', slug: 'tu-nhien-xa-hoi', category: 'STEM', icon: 'Leaf', level: 'PRIMARY' },
  // STEM - Secondary
  { name: 'Toán lớp 6-9', slug: 'toan-cap-2', category: 'STEM', icon: 'Calculator', level: 'SECONDARY' },
  { name: 'Vật lý cấp 2', slug: 'vat-ly-cap-2', category: 'STEM', icon: 'Atom', level: 'SECONDARY' },
  { name: 'Hóa học cấp 2', slug: 'hoa-hoc-cap-2', category: 'STEM', icon: 'FlaskConical', level: 'SECONDARY' },
  { name: 'Sinh học cấp 2', slug: 'sinh-hoc-cap-2', category: 'STEM', icon: 'Leaf', level: 'SECONDARY' },
  { name: 'Khoa học tự nhiên', slug: 'khoa-hoc-tu-nhien', category: 'STEM', icon: 'FlaskConical', level: 'SECONDARY' },
  // STEM - High school
  { name: 'Toán THPT', slug: 'toan-hoc', category: 'STEM', icon: 'Calculator', level: 'HIGH' },
  { name: 'Vật lý THPT', slug: 'vat-ly', category: 'STEM', icon: 'Atom', level: 'HIGH' },
  { name: 'Hóa học THPT', slug: 'hoa-hoc', category: 'STEM', icon: 'FlaskConical', level: 'HIGH' },
  { name: 'Sinh học THPT', slug: 'sinh-hoc', category: 'STEM', icon: 'Leaf', level: 'HIGH' },
  { name: 'Luyện thi THPT QG', slug: 'luyen-thi-thpt', category: 'STEM', icon: 'Award', level: 'HIGH' },
  // Language - all levels
  { name: 'Tiếng Anh tiểu học', slug: 'tieng-anh-tieu-hoc', category: 'LANGUAGE', icon: 'MessageCircle', level: 'PRIMARY' },
  { name: 'Tiếng Anh cấp 2', slug: 'tieng-anh-cap-2', category: 'LANGUAGE', icon: 'MessageCircle', level: 'SECONDARY' },
  { name: 'Tiếng Anh giao tiếp', slug: 'tieng-anh-giao-tiep', category: 'LANGUAGE', icon: 'MessageCircle', level: 'ALL' },
  { name: 'IELTS', slug: 'ielts', category: 'LANGUAGE', icon: 'GraduationCap', level: 'HIGH' },
  { name: 'TOEIC', slug: 'toeic', category: 'LANGUAGE', icon: 'Award', level: 'ALL' },
  { name: 'Tiếng Trung', slug: 'tieng-trung', category: 'LANGUAGE', icon: 'Languages', level: 'ALL' },
  { name: 'Tiếng Nhật', slug: 'tieng-nhat', category: 'LANGUAGE', icon: 'Languages', level: 'ALL' },
  { name: 'Tiếng Hàn', slug: 'tieng-han', category: 'LANGUAGE', icon: 'Languages', level: 'ALL' },
  // Social Sciences
  { name: 'Ngữ Văn THPT', slug: 'ngu-van', category: 'SOCIAL', icon: 'BookOpen', level: 'HIGH' },
  { name: 'Lịch sử', slug: 'lich-su', category: 'SOCIAL', icon: 'Scroll', level: 'HIGH' },
  { name: 'Địa lý', slug: 'dia-ly', category: 'SOCIAL', icon: 'Globe', level: 'HIGH' },
  { name: 'GDCD', slug: 'gdcd', category: 'SOCIAL', icon: 'Scale', level: 'HIGH' },
  // IT
  { name: 'Lập trình Python', slug: 'lap-trinh-python', category: 'IT', icon: 'Code', level: 'ALL' },
  { name: 'Lập trình Scratch', slug: 'lap-trinh-scratch', category: 'IT', icon: 'Code', level: 'PRIMARY' },
  { name: 'Tin học THPT', slug: 'tin-hoc-thpt', category: 'IT', icon: 'Code', level: 'HIGH' },
  // Art - all levels
  { name: 'Vẽ sáng tạo', slug: 've-sang-tao', category: 'ART', icon: 'Palette', level: 'ALL' },
  { name: 'Piano', slug: 'piano', category: 'ART', icon: 'Music', level: 'ALL' },
  { name: 'Guitar', slug: 'guitar', category: 'ART', icon: 'Music', level: 'ALL' },
  { name: 'Thanh nhạc', slug: 'thanh-nhac', category: 'ART', icon: 'Mic', level: 'ALL' },
  // Life skills
  { name: 'Kỹ năng mềm', slug: 'ky-nang-mem', category: 'OTHER', icon: 'Sparkles', level: 'ALL' },
  { name: 'Bồi dưỡng HSG', slug: 'boi-duong-hsg', category: 'STEM', icon: 'Trophy', level: 'HIGH' },
]

// Need to update schema to support `level` field on Subject
// Will use existing fields - add level via separate table OR add field via prisma
const SUBJECTS_FINAL = SUBJECTS.map(s => ({
  name: s.name,
  slug: s.slug,
  category: s.category,
  icon: s.icon,
  // @ts-ignore - level added via schema migration
  level: s.level,
}))

// Tutor profiles - more diverse across cities
const TUTORS = [
  // ===== HANOI TUTORS =====
  {
    name: 'Nguyễn Minh Anh',
    email: 'minhanh.tutor@example.com',
    profession: 'Giáo viên Toán - Trường THPT Chuyên KHTN',
    experienceYears: 7,
    bio: 'Tốt nghiệp Đại học Sư phạm Hà Nội, chuyên ngành Toán học. 7 năm kinh nghiệm giảng dạy Toán THPT, đặc biệt mạnh về ôn thi đại học và thi học sinh giỏi. Phương pháp sư phạm tập trung vào tư duy logic và giải quyết vấn đề.',
    education: 'Thạc sĩ Toán học - ĐH Sư phạm Hà Nội',
    subjects: ['toan-hoc', 'luyen-thi-thpt', 'boi-duong-hsg'],
    pricePerHour: 350000,
    location: { city: 'Hà Nội', district: 'Cầu Giấy' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 8,
  },
  {
    name: 'Trần Hoàng Long',
    email: 'hoanglong.tutor@example.com',
    profession: 'Giảng viên Vật lý - ĐH Bách Khoa',
    experienceYears: 10,
    bio: 'Tiến sĩ Vật lý kỹ thuật, giảng viên tại Đại học Bách Khoa Hà Nội. Chuyên dạy Vật lý THPT, Vật lý đại cương và luyện thi đại học khối A. Có phương pháp giảng dạy trực quan, kết hợp thí nghiệm thực tế.',
    education: 'Tiến sĩ Vật lý kỹ thuật - ĐH Bách Khoa HN',
    subjects: ['vat-ly', 'luyen-thi-thpt'],
    pricePerHour: 400000,
    location: { city: 'Hà Nội', district: 'Ba Đình' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 10,
  },
  {
    name: 'Lê Thị Thu Hà',
    email: 'thuha.tutor@example.com',
    profession: 'Giáo viên Hóa học - Trường THPT Yên Hòa',
    experienceYears: 5,
    bio: 'Tốt nghiệp Đại học Khoa học Tự nhiên, chuyên ngành Hóa học. Giáo viên trẻ, nhiệt tình, yêu thích truyền cảm hứng cho học sinh. Đã giúp nhiều em học sinh đỗ đại học khối B với điểm Hóa cao.',
    education: 'Cử nhân Hóa học - ĐH KHTN',
    subjects: ['hoa-hoc', 'hoa-hoc-cap-2'],
    pricePerHour: 300000,
    location: { city: 'Hà Nội', district: 'Cầu Giấy' },
    teachesAtStudentHome: true, teachesAtOwnPlace: false, travelRadiusKm: 6,
  },
  {
    name: 'Phạm Quốc Bảo',
    email: 'quocbao.tutor@example.com',
    profession: 'Giáo viên Tiếng Anh - IELTS 8.5',
    experienceYears: 6,
    bio: 'Tốt nghiệp Đại học Ngoại ngữ, IELTS 8.5 (Speaking 9.0). 6 năm kinh nghiệm luyện thi IELTS cho học sinh cấp 3 và người đi làm. Đã giúp hơn 100 học sinh đạt target IELTS 7.0+.',
    education: 'Cử nhân Ngôn ngữ Anh - ĐH Ngoại ngữ',
    subjects: ['ielts', 'toeic', 'tieng-anh-giao-tiep', 'tieng-anh-cap-2'],
    pricePerHour: 450000,
    location: { city: 'Hà Nội', district: 'Đống Đa' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 8,
  },
  {
    name: 'Vũ Thị Mai Phương',
    email: 'maiphuong.tutor@example.com',
    profession: 'Họa sĩ - Giảng viên Mỹ thuật',
    experienceYears: 12,
    bio: 'Tốt nghiệp Đại học Mỹ thuật Hà Nội. Họa sĩ chuyên nghiệp với 12 năm kinh nghiệm. Dạy vẽ sáng tạo cho trẻ em và người lớn: vẽ màu nước, acrylic, sơn dầu. Phương pháp khuyến khích sáng tạo cá nhân.',
    education: 'Cử nhân Mỹ thuật - ĐH Mỹ thuật HN',
    subjects: ['ve-sang-tao'],
    pricePerHour: 350000,
    location: { city: 'Hà Nội', district: 'Hoàn Kiếm' },
    teachesAtStudentHome: false, teachesAtOwnPlace: true, travelRadiusKm: 0,
  },
  {
    name: 'Đặng Tuấn Kiệt',
    email: 'tuankiet.tutor@example.com',
    profession: 'Nghệ sĩ Piano - Tốt nghiệp Nhạc viện',
    experienceYears: 15,
    bio: 'Tốt nghiệp Nhạc viện Hà Nội, chuyên ngành Piano. 15 năm kinh nghiệm giảng dạy Piano từ cơ bản đến nâng cao cho trẻ em và người lớn. Có studio riêng với piano cơ và piano điện.',
    education: 'Cử nhân Piano - Nhạc viện HN',
    subjects: ['piano', 'thanh-nhac'],
    pricePerHour: 500000,
    location: { city: 'Hà Nội', district: 'Thanh Xuân' },
    teachesAtStudentHome: false, teachesAtOwnPlace: true, travelRadiusKm: 0,
  },
  {
    name: 'Bùi Thanh Tùng',
    email: 'thanhtung.tutor@example.com',
    profession: 'Nghệ sĩ Guitar - Solo Artist',
    experienceYears: 9,
    bio: 'Nghệ sĩ Guitar chuyên nghiệp, đã biểu diễn tại nhiều sự kiện lớn. Dạy Guitar acoustic, electric và classic cho mọi độ tuổi. Phong cách gần gũi, tập trung vào việc học sinh có thể chơi được bài hát yêu thích ngay.',
    education: 'Cử nhân Âm nhạc - ĐH Văn hóa Nghệ thuật Quân đội',
    subjects: ['guitar'],
    pricePerHour: 350000,
    location: { city: 'Hà Nội', district: 'Hai Bà Trưng' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 7,
  },
  {
    name: 'Hoàng Thị Lan',
    email: 'thilan.tutor@example.com',
    profession: 'Giáo viên Toán - Luyện thi đại học',
    experienceYears: 4,
    bio: 'Cử nhân Toán học, giáo viên trẻ đam mê với nghề. Chuyên ôn thi đại học khối A, A1. Phương pháp học nhanh - nhớ lâu, tập trung vào các dạng bài thi thực tế.',
    education: 'Cử nhân Toán học - ĐH Sư phạm HN',
    subjects: ['toan-hoc', 'toan-cap-2', 'toan-tieu-hoc'],
    pricePerHour: 280000,
    location: { city: 'Hà Nội', district: 'Nam Từ Liêm' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 5,
  },
  {
    name: 'Phan Đức Trí',
    email: 'ductri.tutor@example.com',
    profession: 'Kỹ sư - Giáo viên Vật lý luyện thi',
    experienceYears: 6,
    bio: 'Kỹ sư Cơ khí, tốt nghiệp đại học Bách Khoa. Tự do dạy Vật lý 6 năm, đặc biệt mạnh về cơ học và điện học. Đam mê truyền đạt kiến thức theo cách dễ hiểu nhất.',
    education: 'Kỹ sư Cơ khí - ĐH Bách Khoa HN',
    subjects: ['vat-ly', 'hoa-hoc', 'vat-ly-cap-2'],
    pricePerHour: 320000,
    location: { city: 'Hà Nội', district: 'Long Biên' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 9,
  },
  // Tiểu học tutor
  {
    name: 'Đỗ Thị Hồng Nhung',
    email: 'hongnhung.tutor@example.com',
    profession: 'Giáo viên Tiểu học - Trường Leonardo Da Vinci',
    experienceYears: 8,
    bio: 'Giáo viên tiểu học 8 năm, yêu trẻ và kiên nhẫn. Chuyên phụ đạo Toán, Tiếng Việt lớp 1-5 và luyện chuyển cấp. Phương pháp gần gũi, sử dụng trò chơi học tập để bé thích đi học.',
    education: 'Cử nhân Sư phạm Tiểu học - ĐH Sư phạm HN',
    subjects: ['toan-tieu-hoc', 'tieng-viet-tieu-hoc', 'tu-nhien-xa-hoi', 'tieng-anh-tieu-hoc'],
    pricePerHour: 200000,
    location: { city: 'Hà Nội', district: 'Cầu Giấy' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 5,
  },
  // Cấp 2 tutor
  {
    name: 'Vũ Minh Quân',
    email: 'minhquan.tutor@example.com',
    profession: 'Giáo viên Toán cấp 2 - THCS Cầu Giấy',
    experienceYears: 5,
    bio: 'Giáo viên Toán THCS 5 năm, chuyên dạy Toán 6-9 và luyện thi vào lớp 10 chuyên. Phương pháp chú trọng nền tảng, giúp học sinh hiểu bản chất trước khi giải bài tập.',
    education: 'Cử nhân Sư phạm Toán - ĐH Sư phạm HN',
    subjects: ['toan-cap-2', 'toan-tieu-hoc'],
    pricePerHour: 250000,
    location: { city: 'Hà Nội', district: 'Tây Hồ' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 7,
  },
  // Ngữ Văn tutor
  {
    name: 'Nguyễn Thị Bích Ngọc',
    email: 'bichngoc.tutor@example.com',
    profession: 'Giáo viên Ngữ Văn - THPT Việt Đức',
    experienceYears: 9,
    bio: 'Thạc sĩ Văn học, 9 năm dạy Ngữ Văn THPT. Chuyên luyện thi THPT Quốc gia Ngữ Văn, dạy viết nghị luận xã hội và nghị luận văn học. Đã có nhiều học sinh đạt điểm Văn 9+.',
    education: 'Thạc sĩ Văn học - ĐH KHXH&NV',
    subjects: ['ngu-van', 'lich-su', 'dia-ly'],
    pricePerHour: 320000,
    location: { city: 'Hà Nội', district: 'Hoàn Kiếm' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 6,
  },
  // ===== HO CHI MINH TUTORS =====
  {
    name: 'Sarah Johnson',
    email: 'sarah.tutor@example.com',
    profession: 'Native English Teacher - IELTS Examiner',
    experienceYears: 8,
    bio: 'Native speaker từ Canada, đã sống và giảng dạy tại Việt Nam 8 năm. IELTS 9.0, từng là giám khảo IELTS. Chuyên dạy IELTS Speaking, Writing và giao tiếp công việc. Phương pháp tập trung vào thực hành và phản hồi cá nhân.',
    education: 'MA TESOL - University of Toronto',
    subjects: ['ielts', 'tieng-anh-giao-tiep', 'toeic'],
    pricePerHour: 600000,
    location: { city: 'TP.HCM', district: 'Quận 1' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 12,
  },
  {
    name: 'Trần Khôi Nguyên',
    email: 'khoinguyen.tutor@example.com',
    profession: 'Kỹ sư IT - Giảng viên Python',
    experienceYears: 6,
    bio: 'Kỹ sư phần mềm 8 năm tại các công ty lớn, 6 năm dạy lập trình. Chuyên dạy Python, Scratch cho học sinh cấp 2-3 và người đi làm chuyển ngành. Phương pháp dự án thực tế.',
    education: 'Kỹ sư CNTT - ĐH Bách Khoa TP.HCM',
    subjects: ['lap-trinh-python', 'lap-trinh-scratch', 'tin-hoc-thpt'],
    pricePerHour: 400000,
    location: { city: 'TP.HCM', district: 'Quận 1' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 10,
  },
  {
    name: 'Lê Hoàng Phúc',
    email: 'hoangphuc.tutor@example.com',
    profession: 'Giáo viên Toán THPT - Trường Lê Hồng Phong',
    experienceYears: 11,
    bio: 'Tổ trưởng tổ Toán trường THPT Lê Hồng Phong TP.HCM. 11 năm kinh nghiệm ôn thi THPT QG khối A. Nhiều học sinh đỗ Đại học Bách Khoa, Kinh tế Quốc dân.',
    education: 'Thạc sĩ Toán ứng dụng - ĐH KHTN TP.HCM',
    subjects: ['toan-hoc', 'luyen-thi-thpt', 'boi-duong-hsg'],
    pricePerHour: 380000,
    location: { city: 'TP.HCM', district: 'Quận 5' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 8,
  },
  {
    name: 'Nguyễn Thảo Vy',
    email: 'thaovy.tutor@example.com',
    profession: 'Cử nhân Hóa học - ĐH KHTN TP.HCM',
    experienceYears: 4,
    bio: 'Cử nhân Hóa học ĐH Khoa học Tự nhiên TP.HCM. Chuyên dạy Hóa THPT và luyện thi THPT QG. Phương pháp học nhanh - nhớ lâu qua sơ đồ tư duy.',
    education: 'Cử nhân Hóa học - ĐH KHTN TP.HCM',
    subjects: ['hoa-hoc', 'hoa-hoc-cap-2', 'sinh-hoc'],
    pricePerHour: 280000,
    location: { city: 'TP.HCM', district: 'Quận Bình Thạnh' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 7,
  },
  {
    name: 'Lý Hoàng Nam',
    email: 'hoangnam.tutor@example.com',
    profession: 'HSK 6 - Giáo viên Tiếng Trung',
    experienceYears: 7,
    bio: 'Tốt nghiệp Đại học Ngoại ngữ Hàn Quốc, HSK 6, 7 năm dạy tiếng Trung. Chuyên dạy HSK 3-6, giao tiếp công việc, tiếng Trung thương mại. Từng học tập và làm việc tại Bắc Kinh 3 năm.',
    education: 'Cử nhân Ngôn ngữ Trung - ĐH Ngoại ngữ',
    subjects: ['tieng-trung'],
    pricePerHour: 350000,
    location: { city: 'TP.HCM', district: 'Quận 10' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 8,
  },
  {
    name: 'Phan Thanh Trúc',
    email: 'thanhtruc.tutor@example.com',
    profession: 'Giáo viên tiểu học - ĐH Sư phạm TP.HCM',
    experienceYears: 6,
    bio: 'Giáo viên tiểu học tại TP.HCM 6 năm, đặc biệt mạnh về phương pháp giảng dạySTEM cho bé. Chuyên dạy Toán, Tiếng Việt lớp 1-5 và tiếng Anh tiểu học.',
    education: 'Cử nhân Sư phạm Tiểu học - ĐH Sư phạm TP.HCM',
    subjects: ['toan-tieu-hoc', 'tieng-viet-tieu-hoc', 'tieng-anh-tieu-hoc', 'tu-nhien-xa-hoi'],
    pricePerHour: 220000,
    location: { city: 'TP.HCM', district: 'Quận Phú Nhuận' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 6,
  },
  {
    name: 'Choi Min Joon',
    email: 'minjoon.tutor@example.com',
    profession: 'Native Korean Teacher - TOPIK Examiner',
    experienceYears: 5,
    bio: 'Native Korean từ Seoul, 5 năm dạy tiếng Hàn tại Việt Nam. TOPIK 6, từng là examiner TOPIK. Chuyên dạy giao tiếp, TOPIK và tiếng Hàn thương mại.',
    education: 'BA Korean Language & Literature - SNU',
    subjects: ['tieng-han'],
    pricePerHour: 500000,
    location: { city: 'TP.HCM', district: 'Thành phố Thủ Đức' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 10,
  },
  // ===== DA NANG TUTORS =====
  {
    name: 'Hoàng Thị Kim Ngân',
    email: 'kimngan.tutor@example.com',
    profession: 'Giáo viên Toán - THPT Phan Châu Trinh',
    experienceYears: 8,
    bio: 'Giáo viên Toán THPT tại Đà Nẵng 8 năm. Chuyên ôn thi THPT QG khối A, A1. Phương pháp tập trung vào dạng bài thi và kỹ năng giải nhanh.',
    education: 'Cử nhân Sư phạm Toán - ĐH Sư phạm Đà Nẵng',
    subjects: ['toan-hoc', 'toan-cap-2', 'luyen-thi-thpt'],
    pricePerHour: 280000,
    location: { city: 'Đà Nẵng', district: 'Hải Châu' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 8,
  },
  {
    name: 'Ngô Bá Khôi',
    email: 'bakhoi.tutor@example.com',
    profession: 'Kỹ sư - Dạy Vật lý và Hóa',
    experienceYears: 5,
    bio: 'Kỹ sư Hóa học tại Đà Nẵng, 5 năm dạy thêm Vật lý và Hóa THPT. Đam mê truyền đạt kiến thức khoa học qua thí nghiệm thực tế.',
    education: 'Kỹ sư Hóa học - ĐH Bách Khoa Đà Nẵng',
    subjects: ['vat-ly', 'hoa-hoc', 'sinh-hoc'],
    pricePerHour: 260000,
    location: { city: 'Đà Nẵng', district: 'Thanh Khê' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 7,
  },
  {
    name: 'Trịnh Nhật Minh',
    email: 'nhatminh.tutor@example.com',
    profession: 'Giáo viên Tiếng Anh - IELTS 8.0',
    experienceYears: 6,
    bio: 'Cử nhân Sư phạm Anh, IELTS 8.0. 6 năm dạy IELTS và tiếng Anh giao tiếp tại Đà Nẵng. Phương pháp học qua tình huống thực tế, không học vẹt.',
    education: 'Cử nhân Sư phạm Anh - ĐH Ngoại ngữ Đà Nẵng',
    subjects: ['ielts', 'tieng-anh-giao-tiep', 'tieng-anh-cap-2'],
    pricePerHour: 320000,
    location: { city: 'Đà Nẵng', district: 'Sơn Trà' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 9,
  },
  // ===== HAI PHONG TUTORS =====
  {
    name: 'Đặng Thị Hồng Hạnh',
    email: 'honghanh.tutor@example.com',
    profession: 'Giáo viên Ngữ Văn - THPT Trần Phú',
    experienceYears: 10,
    bio: 'Thạc sĩ Văn học, 10 năm dạy Ngữ Văn THPT tại Hải Phòng. Chuyên luyện thi THPT QG Ngữ Văn và bồi dưỡng HSG Văn.',
    education: 'Thạc sĩ Văn học - ĐH Sư phạm HN',
    subjects: ['ngu-van', 'lich-su', 'dia-ly'],
    pricePerHour: 280000,
    location: { city: 'Hải Phòng', district: 'Lê Chân' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 7,
  },
  {
    name: 'Bùi Đắc Phúc',
    email: 'dacphuc.tutor@example.com',
    profession: 'Kỹ sư - Dạy Toán THPT',
    experienceYears: 4,
    bio: 'Kỹ sư Cầu đường, đam mê Toán. 4 năm dạy Toán THPT và ôn thi đại học tại Hải Phòng. Phương pháp tư duy logic, học qua ví dụ thực tế.',
    education: 'Kỹ sư Xây dựng - ĐH Hàng Hải',
    subjects: ['toan-hoc', 'toan-cap-2', 'luyen-thi-thpt'],
    pricePerHour: 240000,
    location: { city: 'Hải Phòng', district: 'Ngô Quyền' },
    teachesAtStudentHome: true, teachesAtOwnPlace: false, travelRadiusKm: 8,
  },
  // ===== CAN THO TUTORS =====
  {
    name: 'Lâm Hoàng Yến',
    email: 'hoangyen.tutor@example.com',
    profession: 'Giáo viên Hóa - Sinh - THPT Lý Tự Trọng',
    experienceYears: 7,
    bio: 'Cử nhân Sư phạm Hóa-Sinh, 7 năm giảng dạy tại Cần Thơ. Chuyên dạy Hóa, Sinh THPT và luyện thi khối B. Nhiều học sinh đỗ Y Dược.',
    education: 'Cử nhân Sư phạm Hóa - ĐH Cần Thơ',
    subjects: ['hoa-hoc', 'sinh-hoc', 'hoa-hoc-cap-2'],
    pricePerHour: 260000,
    location: { city: 'Cần Thơ', district: 'Ninh Kiều' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 7,
  },
  {
    name: 'Trần Quang Huy',
    email: 'quanghuy.tutor@example.com',
    profession: 'Giáo viên Toán - Tiểu học',
    experienceYears: 5,
    bio: 'Giáo viên tiểu học tại Cần Thơ 5 năm, kiên nhẫn và yêu trẻ. Chuyên phụ đạo Toán, Tiếng Việt lớp 1-5 và luyện chuyển cấp lớp 5 lên 6.',
    education: 'Cử nhân Sư phạm Tiểu học - ĐH Cần Thơ',
    subjects: ['toan-tieu-hoc', 'tieng-viet-tieu-hoc', 'tu-nhien-xa-hoi'],
    pricePerHour: 180000,
    location: { city: 'Cần Thơ', district: 'Bình Thủy' },
    teachesAtStudentHome: true, teachesAtOwnPlace: true, travelRadiusKm: 5,
  },
]

const STUDENT_REVIEW_TEMPLATES = [
  { rating: 5, comment: 'Cô giáo giảng rất dễ hiểu, tâm lý với học sinh. Con tôi tiến bộ rõ rệt sau 2 tháng học.' },
  { rating: 5, comment: 'Thầy dạy nhiệt tình, phương pháp hay. Đặc biệt là luôn đến đúng giờ khi dạy tại nhà.' },
  { rating: 4, comment: 'Bài giảng chất lượng, tuy nhiên đôi lúc hơi nhanh. Nhìn chung rất hài lòng.' },
  { rating: 5, comment: 'Một người giáo viên tuyệt vời! Kiên nhẫn và truyền cảm hứng cho con rất nhiều.' },
  { rating: 5, comment: 'Học với thầy 3 tháng là con tôi tự tin làm bài thi. Cảm ơn thầy rất nhiều.' },
  { rating: 4, comment: 'Giáo viên có kiến thức sâu, đúng giờ. Sẽ tiếp tục học dài hạn.' },
  { rating: 5, comment: 'Phương pháp dạy rất thực tế, kết hợp nhiều ví dụ. Highly recommend!' },
  { rating: 5, comment: 'Sau khóa học con tôi đã đạt target IELTS 7.5. Quá tuyệt vời!' },
  { rating: 5, comment: 'Studio đẹp, piano cơ chất lượng. Thầy dạy rất chi tiết và kiên nhẫn.' },
  { rating: 4, comment: 'Tốt, phù hợp với học sinh muốn học nâng cao. Giá hơi cao nhưng xứng đáng.' },
  { rating: 5, comment: 'Cô giáo rất kiên nhẫn với bé nhà tôi. Bé từ ghét học Toán nay thích đi học rồi.' },
  { rating: 5, comment: 'Phương pháp dạy tiếng Trung rất dễ hiểu. Sau 6 tháng tôi đã thi được HSK 4.' },
  { rating: 5, comment: 'Buổi học đầu tiên con đã thích. Cảm ơn thầy vì sự nhiệt tình!' },
  { rating: 4, comment: 'Tài liệu phong phú, bài tập đa dạng. Sẽ đăng ký tiếp khóa sau.' },
  { rating: 5, comment: 'Từ khi học với cô, điểm Văn của con tôi từ 6 lên 8.5. Quá bất ngờ!' },
]

const STUDENTS = [
  { name: 'Phụ huynh Nguyễn Thị Hoa', email: 'hoa.parent@example.com', location: { city: 'Hà Nội', district: 'Cầu Giấy' } },
  { name: 'Phụ huynh Trần Văn Nam', email: 'nam.parent@example.com', location: { city: 'Hà Nội', district: 'Ba Đình' } },
  { name: 'Phụ huynh Lê Thu Trang', email: 'trang.parent@example.com', location: { city: 'Hà Nội', district: 'Đống Đa' } },
  { name: 'Học sinh Nguyễn Minh Quân', email: 'minhquan.student@example.com', location: { city: 'Hà Nội', district: 'Tây Hồ' } },
  { name: 'Phụ huynh Phạm Thị Lan', email: 'lan.parent@example.com', location: { city: 'Hà Nội', district: 'Hoàn Kiếm' } },
  { name: 'Học sinh Đỗ Hoàng Anh', email: 'hoanganh.student@example.com', location: { city: 'Hà Nội', district: 'Thanh Xuân' } },
  { name: 'Phụ huynh Lý Minh Tâm', email: 'minhtam.parent@example.com', location: { city: 'TP.HCM', district: 'Quận 1' } },
  { name: 'Phụ huynh Vũ Thanh Hà', email: 'thanhhha.parent@example.com', location: { city: 'TP.HCM', district: 'Quận 7' } },
  { name: 'Phụ huynh Đinh Quốc Bảo', email: 'quocbao.parent@example.com', location: { city: 'TP.HCM', district: 'Quận Bình Thạnh' } },
  { name: 'Phụ huynh Hồ Thị Mai', email: 'thimai.parent@example.com', location: { city: 'Đà Nẵng', district: 'Hải Châu' } },
  { name: 'Phụ huynh Nguyễn Văn Hùng', email: 'vanhung.parent@example.com', location: { city: 'Hải Phòng', district: 'Lê Chân' } },
  { name: 'Phụ huynh Trịnh Kim Tuyến', email: 'kimtuyen.parent@example.com', location: { city: 'Cần Thơ', district: 'Ninh Kiều' } },
]

async function main() {
  console.log('🌱 Seeding database (expanded: all grades + 5 cities)...')

  // Clean up
  await db.review.deleteMany()
  await db.booking.deleteMany()
  await db.availability.deleteMany()
  await db.tutorSubject.deleteMany()
  await db.session.deleteMany()
  await db.user.deleteMany()
  await db.subject.deleteMany()

  // Create subjects
  const subjectMap = new Map<string, string>()
  for (const s of SUBJECTS_FINAL) {
    const subject = await db.subject.create({
      data: {
        name: s.name,
        slug: s.slug,
        category: s.category,
        icon: s.icon,
        // @ts-ignore - level field
        level: s.level,
      }
    })
    subjectMap.set(s.slug, subject.id)
  }
  console.log(`✓ Created ${SUBJECTS_FINAL.length} subjects`)

  // Create tutors
  const tutorIds: string[] = []
  for (const t of TUTORS) {
    const loc = LOCATIONS.find(l => l.city === t.location.city && l.district === t.location.district)!
    const passwordHash = await bcrypt.hash('123456', 10)

    const tutor = await db.user.create({
      data: {
        email: t.email,
        passwordHash,
        name: t.name,
        role: 'TUTOR',
        phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
        bio: t.bio,
        profession: t.profession,
        experienceYears: t.experienceYears,
        education: t.education,
        hourlyRate: t.pricePerHour,
        isVerified: true,
        address: `Số ${Math.floor(1 + Math.random() * 200)} Đường ${['Nguyễn Phong Sắc', 'Trần Duy Hưng', 'Kim Mã', 'Hào Nam', 'Láng', 'Tây Sơn', 'Huỳnh Thúc Kháng', 'Nguyễn Trãi', 'Lê Lợi', 'Hai Bà Trưng', 'Nguyễn Huệ'][Math.floor(Math.random() * 11)]}`,
        district: t.location.district,
        city: t.location.city,
        lat: loc.lat + (Math.random() - 0.5) * 0.01,
        lng: loc.lng + (Math.random() - 0.5) * 0.01,
        teachesAtStudentHome: t.teachesAtStudentHome,
        teachesAtOwnPlace: t.teachesAtOwnPlace,
        travelRadiusKm: t.travelRadiusKm,
      }
    })
    tutorIds.push(tutor.id)

    // Add subjects with price
    for (const slug of t.subjects) {
      const subjectId = subjectMap.get(slug)!
      await db.tutorSubject.create({
        data: {
          tutorId: tutor.id,
          subjectId,
          pricePerHour: t.pricePerHour,
          description: t.bio.substring(0, 200)
        }
      })
    }

    // Add availability (Mon-Sun)
    for (let day = 1; day <= 6; day++) {
      await db.availability.create({
        data: {
          tutorId: tutor.id,
          dayOfWeek: day,
          startTime: '18:00',
          endTime: '21:00'
        }
      })
    }
    await db.availability.create({
      data: { tutorId: tutor.id, dayOfWeek: 0, startTime: '08:00', endTime: '20:00' }
    })
  }
  console.log(`✓ Created ${TUTORS.length} tutors across 5 cities`)

  // Create students
  const studentIds: string[] = []
  for (const s of STUDENTS) {
    const loc = LOCATIONS.find(l => l.city === s.location.city && l.district === s.location.district)!
    const passwordHash = await bcrypt.hash('123456', 10)
    const student = await db.user.create({
      data: {
        email: s.email,
        passwordHash,
        name: s.name,
        role: 'STUDENT',
        phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
        district: s.location.district,
        city: s.location.city,
        address: `Số ${Math.floor(1 + Math.random() * 200)} Đường`,
        lat: loc.lat + (Math.random() - 0.5) * 0.01,
        lng: loc.lng + (Math.random() - 0.5) * 0.01,
      }
    })
    studentIds.push(student.id)
  }
  console.log(`✓ Created ${STUDENTS.length} students across 5 cities`)

  // Create sample bookings + reviews
  let bookingCount = 0
  let reviewCount = 0
  for (let i = 0; i < 50; i++) {
    const tutorIdx = Math.floor(Math.random() * tutorIds.length)
    const tutor = TUTORS[tutorIdx]
    const tutorId = tutorIds[tutorIdx]
    const studentId = studentIds[Math.floor(Math.random() * studentIds.length)]
    const subjectSlug = tutor.subjects[Math.floor(Math.random() * tutor.subjects.length)]
    const subjectId = subjectMap.get(subjectSlug)!

    const mode = Math.random() > 0.5 ? 'TUTOR_TO_STUDENT' : 'STUDENT_TO_TUTOR'
    const daysAgo = Math.floor(Math.random() * 90) + 5
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    const dateStr = date.toISOString().split('T')[0]
    const hour = 18 + Math.floor(Math.random() * 3)
    const startTime = `${String(hour).padStart(2, '0')}:00`
    const endTime = `${String(hour + 1).padStart(2, '0')}:30`

    const booking = await db.booking.create({
      data: {
        studentId,
        tutorId,
        subjectId,
        mode,
        date: dateStr,
        startTime,
        endTime,
        durationHours: 1.5,
        status: 'COMPLETED',
        totalAmount: tutor.pricePerHour * 1.5,
        note: 'Buổi học thử nghiệm'
      }
    })
    bookingCount++

    // Add review (75% chance)
    if (Math.random() > 0.25) {
      const tpl = STUDENT_REVIEW_TEMPLATES[Math.floor(Math.random() * STUDENT_REVIEW_TEMPLATES.length)]
      await db.review.create({
        data: {
          tutorId,
          studentId,
          bookingId: booking.id,
          rating: tpl.rating,
          comment: tpl.comment
        }
      })
      reviewCount++
    }
  }
  console.log(`✓ Created ${bookingCount} bookings, ${reviewCount} reviews`)

  console.log('\n✅ Seed completed!')
  console.log('Demo accounts (password: 123456):')
  console.log('  Tutor HN:    minhanh.tutor@example.com')
  console.log('  Tutor HCM:   sarah.tutor@example.com')
  console.log('  Tutor ĐN:    kimngan.tutor@example.com')
  console.log('  Student HN:  hoa.parent@example.com')
  console.log('  Student HCM: minhtam.parent@example.com')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
