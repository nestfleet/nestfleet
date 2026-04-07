# CG-11: NestFleet Nutzungsrichtlinie (Acceptable Use Policy)

**Status**: ENTWURF — Erfordert Prüfung durch qualifizierten Rechtsberater vor Veröffentlichung.
**Letzte Aktualisierung**: 19.03.2026

---

## 1. Zweck

Diese Nutzungsrichtlinie („NR") definiert die zulässigen und unzulässigen Verwendungen der NestFleet-Software. Alle Nutzer und Lizenznehmer müssen diese Richtlinie einhalten.

## 2. Zulässige Verwendung

NestFleet ist ausschließlich für folgende Zwecke konzipiert und lizenziert:
- Kundensupport-Operationen (Einordnung, Weiterleitung, Antworterstellung, Eskalation)
- Software-Änderungsmanagement (Fehlerverfolgung, Änderungsanträge, PR-Erstellung)
- Produktwissensmanagement (Dokumentation, FAQs, Runbooks)
- Betriebsanalysen (Kostenverfolgung, Agentenleistung, Fallmetriken)

## 3. Unzulässige Verwendung

NestFleet darf NICHT verwendet werden für:

### 3.1 Nach dem KI-Gesetz verbotene Praktiken (Art. 5)
- Soziale Bewertung oder Verhaltensklassifizierung natürlicher Personen
- Biometrische Echtzeit-Identifizierung in öffentlich zugänglichen Räumen
- Ausnutzung von Schwächen bestimmter Gruppen (Alter, Behinderung, soziale Lage)
- Unterschwellige Manipulationstechniken

### 3.2 Hochrisiko-Anwendungen (Art. 6) — Nicht unterstützt
- **Beschäftigungs- und HR-Entscheidungen**: Einstellung, Beförderung, Kündigung, Leistungsbewertung
- **Kredit- und Versicherungsbewertung**: Kreditwürdigkeitsprüfung, Risikobewertung
- **Strafverfolgung**: Prädiktive Polizeiarbeit, Beweiswürdigung, Verbrechensaufklärung
- **Öffentliche Dienstleistungen**: Leistungszuweisung, Sozialhilfebestimmung
- **Bildung und Ausbildung**: Schülerbewertung, Zulassungsentscheidungen
- **Einwanderung und Grenzkontrolle**: Asyl-, Visa-, Aufenthaltserlaubnisbearbeitung

### 3.3 Weitere unzulässige Verwendungen
- Medizinische Diagnose oder Behandlungsempfehlungen
- Rechtsberatung oder richterliche Entscheidungsunterstützung
- Finanzanlageberatung oder Handelsentscheidungen
- Überwachung oder Beobachtung von Einzelpersonen
- Erzeugung synthetischer Medien („Deepfakes") zur Täuschung
- Jede Verwendung, die gegen geltendes Recht oder geltende Vorschriften verstößt

## 4. Technische Durchsetzung

NestFleet implementiert folgende technische Kontrollen zur Verhinderung unzulässiger Nutzung:
- **Aktionsstufenmodell**: T0-T5 Klassifizierung mit automatischer Sperrung von T5-Aktionen (verboten)
- **Validierungshülle**: Jeder KI-Vorschlag wird vor der Ausführung gegen Schema, Nachweise und Richtlinien validiert
- **Enthaltung und Eskalation**: Agenten verweigern die Aktion, wenn die Beweislage schwach oder der Anwendungsfall unklar ist
- **Prüfpfad**: Jede Aktion wird mit vollständigem Kontext für die Compliance-Überprüfung protokolliert
- **Rollenbasierte Zugriffskontrolle**: Rollenbasierte Zugriffsrechte verhindern unbefugte Konfigurationsänderungen

## 5. Verantwortung des Kunden

Kunden sind verantwortlich für:
- Sicherstellung, dass ihre Nutzung von NestFleet dieser NR und geltendem Recht entspricht
- Schulung ihrer Teammitglieder zu zulässigen und unzulässigen Verwendungen
- Überwachung ihrer NestFleet-Installation auf Compliance
- Meldung jeder vermuteten unzulässigen Nutzung an den NestFleet-Support

## 6. Durchsetzung

Verstöße gegen diese NR können zur Folge haben:
- Aussetzung oder Widerruf der Lizenz
- Aufforderung zur sofortigen Einstellung der unzulässigen Nutzung
- Vertragliche Rechtsbehelfe gemäß dem NestFleet-Lizenzvertrag

---

**WICHTIG**: Dies ist ein technisch fundierter Entwurf. Er muss vor Veröffentlichung von einem qualifizierten Rechtsberater geprüft werden.
