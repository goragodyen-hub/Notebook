# 📊 Kiosk Real-time Status Dashboard

ระบบ Dashboard แสดงสถานะการใช้งานเครื่อง Kiosk แบบ Real-time โดยดึงข้อมูลโดยตรงจาก Google Sheets เพื่อใช้ในการมอนิเตอร์และควบคุมการใช้งานเครื่องคอมพิวเตอร์สาธารณะภายในเครือข่าย

![Preview](logo.png) *(โลโก้ระบบ)*

## 🚀 คุณสมบัติเด่น (Features)
- **Real-time Monitoring**: อัปเดตสถานะของทุกเครื่องโดยอัตโนมัติทุกๆ 30 วินาที ไม่ต้องกด Refresh เอง
- **Smart Device Mapping**: ระบบแปลงรหัส Serial ของเครื่อง (เช่น `9P0TBV2`) ให้เป็นชื่อเครื่องที่เข้าใจง่าย (เช่น `TRUE 32`) อัตโนมัติ โดยอ้างอิงจากตารางใน Google Sheets
- **Status Indicators**: แยกแยะสถานะชัดเจนด้วยสีและป้ายกำกับ
  - 🟢 **In Use**: มีผู้ใช้งานกำลังล็อกอินอยู่
  - ⚪ **Available**: เครื่องว่าง พร้อมใช้งาน
  - 🔴 **Alarm**: มีการแจ้งเตือนเหตุการณ์ผิดปกติ
- **Recent Activity Feed**: แสดงบันทึกประวัติการทำรายการล่าสุด 20 รายการ เพื่อให้แอดมินติดตามความเคลื่อนไหวได้ทันท่วงที
- **Modern Dark Theme**: ดีไซน์สวยงาม สบายตา สไตล์แอปพลิเคชันยุคใหม่ รองรับการแสดงผลบนหน้าจอทุกขนาด (Responsive)

## 🛠️ วิธีการทำงาน (How it works)
ตัวระบบเขียนด้วย HTML, Vanilla CSS และ JavaScript โดยใช้ Library `PapaParse` ในการดึงข้อมูลที่เป็น CSV มาจาก Google Sheets ผ่าน Visualization API ทำให้ไม่ต้องมีระบบหลังบ้าน (Backend) และสามารถนำไปเปิดใช้งานได้ฟรีบน GitHub Pages

## 📦 วิธีการนำไปใช้งาน (Deployment)
หากต้องการนำหน้านี้ไปเปิดใช้งานบนอินเทอร์เน็ต (GitHub Pages) เพื่อให้ดูได้จากทุกที่:

1. สมัครใช้งาน หรือเข้าสู่ระบบที่ [GitHub.com](https://github.com/)
2. สร้าง Repository ใหม่ (เช่นชื่อ `kiosk-dashboard`)
3. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้นไป:
   - `index.html`
   - `style.css`
   - `app.js`
   - `logo.png`
   - `README.md`
4. ไปที่แท็บ **Settings** ของ Repository นั้น -> เลือกเมนู **Pages** ด้านซ้ายมือ
5. ในหัวข้อ Build and deployment ให้เลือก Source เป็น **`main`** หรือ **`master`** branch แล้วกด **Save**
6. รอประมาณ 1-2 นาที ระบบจะให้ URL เว็บไซต์มา (เช่น `https://ชื่อผู้ใช้.github.io/kiosk-dashboard/`) สามารถนำ URL นี้ไปเปิดดูสถานะได้จากทุกอุปกรณ์ครับ

---
*โปรเจคนี้พัฒนาขึ้นเพื่อใช้งานร่วมกับระบบ CD Login System สำหรับเครื่อง Kiosk*
