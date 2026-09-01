import type { Educator, EducatorApplication, Subject } from '../types';

export const subjects: Subject[] = [
  { id: 'quran', slug: 'quran-nazra', name: "Qur'an & Nazra", category: 'faith', active: true, localizedNames: { en: "Qur'an & Nazra", hi: 'क़ुरआन और नाज़रा', ur: 'قرآن و ناظرہ' } },
  { id: 'tajweed', slug: 'tajweed', name: 'Tajweed', category: 'faith', active: true, localizedNames: { en: 'Tajweed', hi: 'तजवीद', ur: 'تجوید' } },
  { id: 'islamic', slug: 'islamic-studies', name: 'Islamic Studies', category: 'faith', active: true, localizedNames: { en: 'Islamic Studies', hi: 'इस्लामिक स्टडीज़', ur: 'اسلامی تعلیمات' } },
  { id: 'english', slug: 'spoken-english', name: 'Spoken English', category: 'practical', active: true, localizedNames: { en: 'Spoken English', hi: 'स्पोकन इंग्लिश', ur: 'بول چال انگریزی' } },
  { id: 'maths', slug: 'school-maths', name: 'School Mathematics', category: 'academic', active: true, localizedNames: { en: 'School Mathematics', hi: 'स्कूल गणित', ur: 'اسکول ریاضی' } },
  { id: 'science', slug: 'school-science', name: 'School Science', category: 'academic', active: true, localizedNames: { en: 'School Science', hi: 'स्कूल विज्ञान', ur: 'اسکول سائنس' } },
  { id: 'computer', slug: 'computer-basics', name: 'Computer Basics', category: 'practical', active: true, localizedNames: { en: 'Computer Basics', hi: 'कंप्यूटर बेसिक्स', ur: 'کمپیوٹر کی بنیادی باتیں' } }
];

export const educators: Educator[] = [
  {
    id: 'sana-fatima', educatorId: 'sana-fatima', slug: 'sana-fatima', displayName: 'Sana Fatima', initials: 'SF', city: 'Hyderabad',
    languages: ['English', 'Urdu', 'Hindi'], headline: 'Gentle, structured Qur’an learning for adult beginners',
    biography: 'I help learners build confidence in recitation through calm, practical one-to-one lessons shaped around their pace.',
    subjects: ["Qur'an & Nazra", 'Tajweed'],
    subjectRefs: [{ id: 'quran', name: "Qur'an & Nazra" }, { id: 'tajweed', name: 'Tajweed' }],
    rating: 4.9, reviewCount: 86, completedClasses: 412,
    yearsExperience: 8, priceFrom: 449, responseTime: 'Usually replies in 2 hours', nextAvailable: 'Today, 7:30 pm',
    verified: { identity: true, qualifications: true, subjects: true }, accent: 'plum'
  },
  {
    id: 'aaliya-khan', educatorId: 'aaliya-khan', slug: 'aaliya-khan', displayName: 'Aaliya Khan', initials: 'AK', city: 'Lucknow',
    languages: ['English', 'Hindi', 'Urdu'], headline: 'Speak English naturally—with practice that feels safe',
    biography: 'A communication coach focused on everyday conversations, workplace confidence and interview preparation for women returning to work.',
    subjects: ['Spoken English'],
    subjectRefs: [{ id: 'english', name: 'Spoken English' }],
    rating: 4.8, reviewCount: 64, completedClasses: 305,
    yearsExperience: 6, priceFrom: 599, responseTime: 'Usually replies in 1 hour', nextAvailable: 'Tomorrow, 11:00 am',
    verified: { identity: true, qualifications: true, subjects: true }, accent: 'saffron'
  },
  {
    id: 'meher-parveen', educatorId: 'meher-parveen', slug: 'meher-parveen', displayName: 'Meher Parveen', initials: 'MP', city: 'Bengaluru',
    languages: ['English', 'Hindi'], headline: 'Friendly tech lessons, from first click to confident use',
    biography: 'I turn intimidating technology into small, useful skills—from email and documents to online safety and digital payments.',
    subjects: ['Computer Basics'],
    subjectRefs: [{ id: 'computer', name: 'Computer Basics' }],
    rating: 5.0, reviewCount: 41, completedClasses: 226,
    yearsExperience: 9, priceFrom: 549, responseTime: 'Usually replies in 3 hours', nextAvailable: 'Mon, 5:00 pm',
    verified: { identity: true, qualifications: true, subjects: true }, accent: 'teal'
  },
  {
    id: 'rida-shaikh', educatorId: 'rida-shaikh', slug: 'rida-shaikh', displayName: 'Rida Shaikh', initials: 'RS', city: 'Pune',
    languages: ['English', 'Hindi', 'Marathi'], headline: 'Maths that finally makes sense, one idea at a time',
    biography: 'A patient school educator who helps learners understand the “why” behind maths and science instead of memorising steps.',
    subjects: ['School Mathematics', 'School Science'],
    subjectRefs: [{ id: 'maths', name: 'School Mathematics' }, { id: 'science', name: 'School Science' }],
    rating: 4.9, reviewCount: 53, completedClasses: 278,
    yearsExperience: 7, priceFrom: 499, responseTime: 'Usually replies in 2 hours', nextAvailable: 'Tue, 6:30 pm',
    verified: { identity: true, qualifications: true, subjects: true }, accent: 'rose'
  }
];

export const applications: EducatorApplication[] = [
  { id: 'app-001', educatorName: 'Nida Rahman', email: 'nida@example.test', submittedAt: '2026-08-29T07:30:00Z', subjects: ['Islamic Studies'], languages: ['English', 'Urdu'], experience: '5 years', status: 'submitted' },
  { id: 'app-002', educatorName: 'Divya Arora', email: 'divya@example.test', submittedAt: '2026-08-28T11:00:00Z', subjects: ['Spoken English'], languages: ['English', 'Hindi'], experience: '8 years', status: 'under_review' },
  { id: 'app-003', educatorName: 'Huma Siddiqui', email: 'huma@example.test', submittedAt: '2026-08-27T09:15:00Z', subjects: ["Qur'an & Nazra", 'Tajweed'], languages: ['Hindi', 'Urdu'], experience: '6 years', status: 'changes_requested' }
];
