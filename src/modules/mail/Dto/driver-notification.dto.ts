export interface SendDriverApplicationNotificationOptions {
  applicantName: string;
  applicantEmail: string;
  paypalEmail: string;
  applicationDate: string;
}

export interface SendDriverApprovedNotificationOptions {
  to: string;
  driverName: string;
}

export interface SendDriverRejectedNotificationOptions {
  to: string;
  driverName: string;
  rejectionReason: string;
}
