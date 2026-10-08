export const auditSocReports = {
  files: [
    'AppStats',
    'High/Critical',
    'Internal Host',
    'Rule-Zone',
    'Threat Summary',
    'Top Source',
    'Traffic Application',
    'Traffic Denied',
    'Traffic Top',
    'URL Blocked',
    'URL Summary'
  ],
  daily: [
    {
      date: '08/10/2026',
      AppStats: 'ada',
      'High/Critical': '2 file',
      'Internal Host': 'ada',
      'Rule-Zone': 'ada',
      'Threat Summary': 'ada',
      'Top Source': 'ada',
      'Traffic Application': 'ada',
      'Traffic Denied': 'ada',
      'Traffic Top': 'ada',
      'URL Blocked': 'tidak ada',
      'URL Summary': 'ada'
    },
    {
      date: '07/10/2026',
      AppStats: 'ada',
      'High/Critical': 'ada',
      'Internal Host': 'ada',
      'Rule-Zone': 'ada',
      'Threat Summary': 'ada',
      'Top Source': 'ada',
      'Traffic Application': 'ada',
      'Traffic Denied': 'ada',
      'Traffic Top': 'ada',
      'URL Blocked': 'ada',
      'URL Summary': 'ada'
    },
    {
      date: '06/10/2026',
      AppStats: 'ada',
      'High/Critical': 'ada',
      'Internal Host': 'tidak ada',
      'Rule-Zone': 'ada',
      'Threat Summary': 'ada',
      'Top Source': 'ada',
      'Traffic Application': 'ada',
      'Traffic Denied': 'ada',
      'Traffic Top': 'ada',
      'URL Blocked': 'ada',
      'URL Summary': 'ada'
    },
    {
      date: '05/10/2026',
      AppStats: 'ada',
      'High/Critical': 'ada',
      'Internal Host': 'ada',
      'Rule-Zone': 'ada',
      'Threat Summary': 'ada',
      'Top Source': 'ada',
      'Traffic Application': 'ada',
      'Traffic Denied': 'tidak ada',
      'Traffic Top': 'ada',
      'URL Blocked': 'ada',
      'URL Summary': 'ada'
    },
    {
      date: '04/10/2026',
      AppStats: 'ada',
      'High/Critical': 'ada',
      'Internal Host': 'ada',
      'Rule-Zone': 'ada',
      'Threat Summary': 'ada',
      'Top Source': 'ada',
      'Traffic Application': 'ada',
      'Traffic Denied': 'ada',
      'Traffic Top': 'ada',
      'URL Blocked': 'ada',
      'URL Summary': 'ada'
    },
    {
      date: '03/10/2026',
      AppStats: 'ada',
      'High/Critical': 'ada',
      'Internal Host': 'ada',
      'Rule-Zone': 'tidak ada',
      'Threat Summary': 'ada',
      'Top Source': 'ada',
      'Traffic Application': 'ada',
      'Traffic Denied': 'ada',
      'Traffic Top': 'ada',
      'URL Blocked': 'ada',
      'URL Summary': 'ada'
    },
    {
      date: '02/10/2026',
      AppStats: 'ada',
      'High/Critical': 'ada',
      'Internal Host': 'ada',
      'Rule-Zone': 'ada',
      'Threat Summary': 'ada',
      'Top Source': 'ada',
      'Traffic Application': 'ada',
      'Traffic Denied': 'ada',
      'Traffic Top': 'ada',
      'URL Blocked': 'ada',
      'URL Summary': 'ada'
    }
  ],
  truncatedFiles: [
    { date: '08/10/2026', file: 'High/Critical', note: '2 file terpotong (mencapai 10.000 baris)' }
  ]
};

export const auditNocPdfStats = [
  { date: '08/10/2026', files: 12, pages: 145, unique_sensors: 142, duplicates_removed: 3, failed_reads: 0, date_mismatch: 0, notes: '' },
  { date: '07/10/2026', files: 12, pages: 144, unique_sensors: 141, duplicates_removed: 3, failed_reads: 1, date_mismatch: 0, notes: 'Gagal: PRTG_Report_07_backup.pdf' },
  { date: '06/10/2026', files: 12, pages: 143, unique_sensors: 140, duplicates_removed: 3, failed_reads: 0, date_mismatch: 0, notes: '' },
  { date: '05/10/2026', files: 12, pages: 145, unique_sensors: 142, duplicates_removed: 3, failed_reads: 0, date_mismatch: 1, notes: 'Tanggal tidak cocok: PRTG_04102026.pdf' },
  { date: '04/10/2026', files: 12, pages: 144, unique_sensors: 141, duplicates_removed: 3, failed_reads: 0, date_mismatch: 0, notes: '' },
  { date: '03/10/2026', files: 12, pages: 142, unique_sensors: 139, duplicates_removed: 3, failed_reads: 2, date_mismatch: 0, notes: 'Gagal: PRTG_03_v1.pdf, PRTG_03_corrupt.pdf' },
  { date: '02/10/2026', files: 12, pages: 145, unique_sensors: 142, duplicates_removed: 3, failed_reads: 0, date_mismatch: 0, notes: '' }
];

export const auditNocCoverage = [
  { date: '08/10/2026', sensors_read: 142, sensors_expected: 150, coverage: 94.67 },
  { date: '07/10/2026', sensors_read: 141, sensors_expected: 150, coverage: 94.0 },
  { date: '06/10/2026', sensors_read: 140, sensors_expected: 150, coverage: 93.33 },
  { date: '05/10/2026', sensors_read: 142, sensors_expected: 150, coverage: 94.67 },
  { date: '04/10/2026', sensors_read: 141, sensors_expected: 150, coverage: 94.0 },
  { date: '03/10/2026', sensors_read: 139, sensors_expected: 150, coverage: 92.67 },
  { date: '02/10/2026', sensors_read: 142, sensors_expected: 150, coverage: 94.67 }
];
