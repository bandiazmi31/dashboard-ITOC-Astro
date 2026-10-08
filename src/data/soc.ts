export const socSummary = {
  totalThreats: 1420,
  highCriticalThreats: 85,
  highCriticalPercentage: 5.98,
  blockedThreatsCount: 1390,
  blockedThreatsPercentage: 97.89,
  firewallTrafficTB: 45.2,
  firewallSessions: "1.4M",
  trendDaily: [
    { date: "2026-10-01", all: 150, high: 10 },
    { date: "2026-10-02", all: 180, high: 12 },
    { date: "2026-10-03", all: 130, high: 5 },
    { date: "2026-10-04", all: 210, high: 18 },
    { date: "2026-10-05", all: 195, high: 14 },
    { date: "2026-10-06", all: 260, high: 16 },
    { date: "2026-10-07", all: 295, high: 10 },
  ],
  trafficDaily: [
    { date: "2026-10-01", tb: 6.2 },
    { date: "2026-10-02", tb: 5.8 },
    { date: "2026-10-03", tb: 6.5 },
    { date: "2026-10-04", tb: 7.1 },
    { date: "2026-10-05", tb: 6.9 },
    { date: "2026-10-06", tb: 6.4 },
    { date: "2026-10-07", tb: 6.3 },
  ]
};

export const socAnalytics = {
  bySeverity: [
    { severity: 'Critical', count: 45, percentage: 3.2, color: 'red' },
    { severity: 'High', count: 120, percentage: 8.5, color: 'orange' },
    { severity: 'Medium', count: 580, percentage: 40.8, color: 'yellow' },
    { severity: 'Low', count: 675, percentage: 47.5, color: 'blue' }
  ],
  highCriticalThreats: [
    { name: 'SMB: User Password Brute Force Attempt', count: 28, percentage: 33 },
    { name: 'HTTP: SQL Injection Vulnerability', count: 18, percentage: 21 },
    { name: 'SSL Certificate Expired or Invalid', count: 12, percentage: 14 },
    { name: 'DNS Tunneling Detection', count: 9, percentage: 11 },
    { name: 'Malware.Gen Command and Control Traffic', count: 7, percentage: 8 },
    { name: 'Port Scan Detection', count: 5, percentage: 6 },
    { name: 'Suspicious PowerShell Activity', count: 3, percentage: 4 },
    { name: 'HTTP: Directory Traversal', count: 2, percentage: 2 },
    { name: 'FTP Brute Force Login Attempt', count: 1, percentage: 1 }
  ],
  threatUrlCategories: [
    { category: 'malware', count: 342, percentage: 45 },
    { category: 'phishing', count: 198, percentage: 26 },
    { category: 'command-and-control', count: 124, percentage: 16 },
    { category: 'questionable', count: 56, percentage: 7 },
    { category: 'hacking', count: 28, percentage: 4 },
    { category: 'proxy-avoidance', count: 12, percentage: 2 }
  ],
  internalHostsWithThreats: [
    { ip: '10.20.15.142', hostname: 'WS-FIN-042', count: 56, percentage: 18 },
    { ip: '10.20.8.221', hostname: 'WS-HR-019', count: 48, percentage: 15 },
    { ip: '10.20.12.89', hostname: 'WS-IT-105', count: 42, percentage: 13 },
    { ip: '10.20.5.167', hostname: 'WS-LOG-033', count: 38, percentage: 12 },
    { ip: '10.20.18.203', hostname: 'WS-OPS-078', count: 31, percentage: 10 },
    { ip: '10.20.9.144', hostname: 'SRV-DB-02', count: 28, percentage: 9 },
    { ip: '10.20.22.56', hostname: 'WS-MKT-014', count: 24, percentage: 8 },
    { ip: '10.20.14.192', hostname: 'WS-SALES-067', count: 19, percentage: 6 },
    { ip: '10.20.11.88', hostname: 'WS-DEV-021', count: 16, percentage: 5 },
    { ip: '10.20.7.201', hostname: 'WS-ADMIN-009', count: 12, percentage: 4 }
  ],
  highCriticalSources: [
    { ip: '185.220.101.47', country: 'Russia', count: 34, percentage: 40 },
    { ip: '103.89.91.122', country: 'China', count: 22, percentage: 26 },
    { ip: '91.219.237.244', country: 'Netherlands', count: 12, percentage: 14 },
    { ip: '178.128.85.165', country: 'Iran', count: 8, percentage: 9 },
    { ip: '200.158.125.77', country: 'Brazil', count: 5, percentage: 6 },
    { ip: '43.229.63.198', country: 'North Korea', count: 3, percentage: 4 },
    { ip: '117.239.67.12', country: 'Vietnam', count: 1, percentage: 1 }
  ],
  topApplicationsByTraffic: [
    { app: 'web-browsing', traffic_gb: 12.4, percentage: 35 },
    { app: 'ssl', traffic_gb: 8.7, percentage: 25 },
    { app: 'dns', traffic_gb: 4.2, percentage: 12 },
    { app: 'anydesk', traffic_gb: 3.1, percentage: 9 },
    { app: 'microsoft-update', traffic_gb: 2.8, percentage: 8 },
    { app: 'zoom', traffic_gb: 1.9, percentage: 5 },
    { app: 'paloalto-updates', traffic_gb: 1.2, percentage: 3 },
    { app: 'ms-onedrive', traffic_gb: 0.8, percentage: 2 },
    { app: 'smtp', traffic_gb: 0.3, percentage: 1 }
  ]
};
