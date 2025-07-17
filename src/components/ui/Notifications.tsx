import { Notifications as MantineNotifications, NotificationsProps } from '@mantine/notifications';
import { showNotification } from '@mantine/notifications';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import React from 'react';

export const Notifications = (props: NotificationsProps) => {
  return <MantineNotifications {...props} />;
};

export const notifyError = (message: string) =>
  showNotification({ message, color: 'red', icon: <AlertTriangle size={16} /> });

export const notifySuccess = (message: string) =>
  showNotification({ message, color: 'teal', icon: <CheckCircle2 size={16} /> }); 