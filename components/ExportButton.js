// components/ExportButton.js
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { Alert, Button, Platform } from 'react-native';
import XLSX from 'xlsx';

export default function ExportButton({
  members,      // each member now has { id, firstName, lastName, … }
  teamsList,
  allAttendance,
  dateList,
}) {
  const teamsArray = Array.isArray(teamsList)
    ? teamsList
    : Object.entries(teamsList || {}).map(([id, t]) => ({ id, ...t }));

  const getTeamNames = m =>
    (m.teams || [])
      .map(teamId => teamsArray.find(t => t.id === teamId)?.name)
      .filter(Boolean)
      .join(', ');

  const exportWith = async ({ daily, summary, membersOnly }) => {
    const wb = XLSX.utils.book_new();

    // Daily sheets
    if (daily) {
      dateList.forEach(dateKey => {
        const dayData = allAttendance[dateKey] || {};

        const present = members
          .filter(m => dayData[m.id])
          .map(m => ({
            ID: m.id,
            'First Name': m.firstName,
            'Last Name':  m.lastName,
          }));
        const absent = members
          .filter(m => !dayData[m.id])
          .map(m => ({
            ID: m.id,
            'First Name': m.firstName,
            'Last Name':  m.lastName,
          }));

        const maxRows = Math.max(present.length, absent.length);
        const rows = Array.from({ length: maxRows }, (_, i) => ({
          'Present ID':    present[i]?.ID   || '',
          'Present First': present[i]?.['First Name'] || '',
          'Present Last':  present[i]?.['Last Name']  || '',
          'Absent ID':     absent[i]?.ID    || '',
          'Absent First':  absent[i]?.['First Name']  || '',
          'Absent Last':   absent[i]?.['Last Name']   || '',
        }));

        const ws = XLSX.utils.json_to_sheet(rows, {
          header: [
            'Present ID','Present First','Present Last',
            'Absent ID','Absent First','Absent Last'
          ],
          skipHeader: false,
        });
        XLSX.utils.book_append_sheet(wb, ws, dateKey);
      });
    }

    // Attendance summary
    if (summary) {
      const rows = members.map(m => {
        const total   = dateList.length;
        const present = dateList.filter(d => allAttendance[d]?.[m.id]).length;
        const pct     = total ? Math.round((present/total)*100) : 0;
        return {
          ID:           m.id,
          'First Name': m.firstName,
          'Last Name':  m.lastName,
          Attendance:   `${pct}%`,
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows, {
        header: ['ID','First Name','Last Name','Attendance'],
        skipHeader: false,
      });
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance Summary');
    }

    // Members detail
    if (membersOnly) {
      const rows = members.map(m => ({
        ID:           m.id,
        Title:        m.title || '',
        'First Name': m.firstName,
        'Last Name':  m.lastName,
        Office:       m.office || '',
        Phone:        m.phone    || '',
        Email:        m.email    || '',
        Address:      m.address  || '',
        Gender:       m.gender   || '',
        Birthday:     m.birthday || '',
        'Born Again': m.bornAgain ? 'Yes' : 'No',
        'Baptised by Immersion': m.baptisedByImmersion ? 'Yes' : 'No',
        'Holy Ghost Baptism':    m.receivedHolyGhost   ? 'Yes' : 'No',
        'Department/Ministry':   getTeamNames(m),
      }));
      const ws = XLSX.utils.json_to_sheet(rows, {
        header: [
          'ID','Title','First Name','Last Name','Office',
          'Phone','Email','Address','Gender','Birthday',
          'Born Again','Baptised by Immersion','Holy Ghost Baptism',
          'Department/Ministry'
        ],
        skipHeader: false,
      });
      XLSX.utils.book_append_sheet(wb, ws, 'Members');
    }

    // write + share
    const wbout = XLSX.write(wb, { type:'base64', bookType:'xlsx' });
    const path  = `${FileSystem.cacheDirectory}church-data.xlsx`;
    await FileSystem.writeAsStringAsync(path, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (Platform.OS === 'web') {
      Alert.alert('Export ready', 'Download church-data.xlsx from cache.');
    } else {
      await Sharing.shareAsync(path, {
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle:'Share church-data.xlsx',
      });
    }
  };

  const showOptions = () => {
    Alert.alert(
      'Export Options',
      'Which sheets would you like?',
      [
        { text: 'Daily Sheets Only', onPress: () => exportWith({ daily: true,  summary: false, membersOnly: false }) },
        { text: 'Attendance Summary', onPress: () => exportWith({ daily: false, summary: true,  membersOnly: false }) },
        { text: 'Members Only',       onPress: () => exportWith({ daily: false, summary: false, membersOnly: true  }) },
        { text: 'Everything',         onPress: () => exportWith({ daily: true,  summary: true,  membersOnly: true  }) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return <Button title="Export data to Excel" onPress={showOptions} />;
}