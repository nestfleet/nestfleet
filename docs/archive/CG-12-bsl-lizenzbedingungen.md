# CG-12: NestFleet Business Source License (BSL) — Lizenzbedingungen

**Status**: ENTWURF — Erfordert Prüfung durch qualifizierten Rechtsberater mit Schwerpunkt Softwarelizenzierung vor Veröffentlichung.
**Letzte Aktualisierung**: 19.03.2026

---

## 1. Lizenzgewährung

Vorbehaltlich der Bedingungen dieser Lizenz gewährt die NestFleet GmbH („Lizenzgeber") Ihnen („Lizenznehmer") eine nicht-exklusive, nicht übertragbare Lizenz zur Nutzung, Vervielfältigung, Änderung und Bereitstellung der NestFleet-Software („Software") unter den folgenden Bedingungen.

## 2. Business Source License Modell

Die Software wird unter der Business Source License 1.1 (BSL 1.1) mit folgenden Parametern lizenziert:

| Parameter | Wert |
|---|---|
| Lizenziertes Werk | NestFleet v1.x |
| Lizenzgeber | NestFleet GmbH |
| Änderungsdatum | [4 Jahre nach Erstveröffentlichung — z. B. 19.03.2030] |
| Änderungslizenz | Apache License 2.0 |
| Zusätzliche Nutzungsgenehmigung | Produktionsnutzung für interne Kundensupport-Operationen ist unter allen Lizenzstufen gestattet |

## 3. Zulässige Nutzung

### 3.1 Alle Stufen
- Bereitstellung von NestFleet auf eigener Infrastruktur für eigene Kundensupport-Operationen
- Änderung des Quellcodes für eigene interne Nutzung
- Integration von NestFleet mit bestehenden Werkzeugen (GitHub, E-Mail, Telegram usw.)

### 3.2 Nach Stufe

| Stufe | Produkte | Funktionen | Support |
|---|---|---|---|
| Testversion (Trial) | 1 | Alle Funktionen, 30 Tage | Community |
| Starter | 1 | Kernfunktionen | Community |
| Professional | Bis zu 10 | Alle Funktionen inkl. SSO, erweiterte Analysen | E-Mail-Support |
| Enterprise | Unbegrenzt | Alle Funktionen + SCIM, Audit-Log-Export, Compliance-Vorlagen | Prioritäts-Support + SLA |

## 4. Unzulässige Nutzung

Folgende Nutzungen sind unter allen Stufen untersagt:
- **Konkurrierender gehosteter Dienst**: Anbieten von NestFleet oder eines im Wesentlichen ähnlichen Produkts als gehosteter/SaaS-Dienst an Dritte
- **Weiterverkauf**: Unterlizenzierung, Weiterverkauf oder Vertrieb der Software an Dritte als eigenständiges Produkt
- **Unzulässige Anwendungsfälle**: Wie in der NestFleet Nutzungsrichtlinie (CG-11) definiert

## 5. Open-Source-Umwandlung

Am Änderungsdatum (4 Jahre nach Erstveröffentlichung) wird die Software automatisch auf die Apache License 2.0 umgestellt. Nach diesem Datum entfallen alle BSL-Beschränkungen.

## 6. Quellcode-Einsicht

Der vollständige Quellcode von NestFleet steht zur Einsichtnahme, Prüfung und Änderung zur Verfügung. Dies unterstützt:
- Sicherheitsprüfungen durch Kunden
- Compliance-Verifizierung
- Interne Anpassungen
- Community-Beiträge (unter CLA)

## 7. Testversion

- Laufzeit: 30 Tage ab Erstaktivierung
- Funktionen: Alle Funktionen aktiviert (entspricht Enterprise-Stufe)
- Produkte: Beschränkung auf 1 Produkt
- Umwandlung: Nach Ablauf der Testphase muss auf eine kostenpflichtige Stufe gewechselt oder die Nutzung eingestellt werden
- Daten: Der Kunde behält die volle Kontrolle über seine Daten; während der Testphase werden keine Daten an den Lizenzgeber übermittelt

## 8. Lizenzvalidierung

- Lizenzschlüssel werden über den Cloud-Verbindungskanal validiert (optional)
- Offline-Betrieb wird über JWT-basierte Lizenzdateien unterstützt
- Lizenzablauf führt zu sanfter Herabstufung — Updatekanal deaktiviert, lokale Funktionen laufen weiter
- Kein Kill-Switch — das Produkt stellt den Betrieb niemals aufgrund von Lizenzproblemen ein

## 9. Geistiges Eigentum

- Die Software ist Eigentum der NestFleet GmbH
- Kundenänderungen verbleiben im Eigentum des Kunden
- Beiträge zum Upstream-Projekt erfordern einen Contributor License Agreement (CLA)

## 10. Gewährleistungsausschluss

DIE SOFTWARE WIRD „WIE BESEHEN" OHNE JEGLICHE GEWÄHRLEISTUNG BEREITGESTELLT. DER LIZENZGEBER SCHLIESST ALLE AUSDRÜCKLICHEN UND STILLSCHWEIGENDEN GEWÄHRLEISTUNGEN AUS, EINSCHLIESSLICH, ABER NICHT BESCHRÄNKT AUF GEWÄHRLEISTUNGEN DER MARKTGÄNGIGKEIT UND EIGNUNG FÜR EINEN BESTIMMTEN ZWECK.

## 11. Haftungsbeschränkung

IN KEINEM FALL HAFTET DER LIZENZGEBER FÜR INDIREKTE, ZUFÄLLIGE, BESONDERE ODER FOLGESCHÄDEN, DIE SICH AUS DER NUTZUNG DER SOFTWARE ERGEBEN.

**Hinweis zu § 305c BGB**: Im Falle von Widersprüchen zwischen der deutschen und der englischen Fassung gilt die für den Lizenznehmer günstigere Auslegung.

---

**WICHTIG**: Dies ist ein technisch fundierter Entwurf von Lizenzbedingungen. Er muss vor Veröffentlichung oder Verwendung in geschäftlichen Vereinbarungen von einem qualifizierten Rechtsberater mit Schwerpunkt Softwarelizenzierung und Open-Source-Recht geprüft werden.
