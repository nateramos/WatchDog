import { Shell } from './Layout.jsx'
// Results of tracking/eval_clips.py on the 42 staged home clips (tracking/eval/results.csv).
const RESULTS = [
  { label: 'Gun clips caught', bright: '3 of 3', dim: '3 of 3', total: '6 of 6 (100%)' },
  { label: 'No-gun clips with no false alarm', bright: '18 of 18', dim: '17 of 18', total: '35 of 36 (97.2%)' },
]

function ResultsTable() {
  return (
    <div className="table-wrap results">
      <table>
        <caption>Model Dublin on 42 staged home clips</caption>
        <thead>
          <tr>
            <th />
            <th>Normal light</th>
            <th>Dim light</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {RESULTS.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{r.bright}</td>
              <td>{r.dim}</td>
              <td className="result-right">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function About() {
  return (
    <Shell>
      <article className="prose">
        <h2>About WatchDog</h2>
        <p className="lead">
          WatchDog is a campus safety tool that informs human responders and does not make
          decisions for them.
        </p>

        <h3>The problem</h3>
        <p>
          When a weapon appears on a campus camera, the first minutes matter. Security staff
          often watch many feeds at once and can miss what one camera shows. WatchDog points a
          person at the moment that needs a second look, so a human can decide quickly.
        </p>

        <h3>What the MVP does</h3>
        <ol>
          <li>You upload a recorded video clip. (The built-in demo video is being updated.)</li>
          <li>
            An object detection model checks frames from the clip for a possible weapon and
            gives each finding a confidence score. The model is trained on both guns and
            knives, but for now the MVP flags firearms only.
          </li>
          <li>
            Each flagged frame goes to a review screen. A person must confirm or dismiss it
            before anything counts as an alert.
          </li>
          <li>Every flag and every reviewer decision is written to a log.</li>
        </ol>

        <h3>Safety guardrails</h3>
        <ul>
          <li>
            <strong>Human in the loop.</strong> The model never raises an alert by itself. A
            reviewer confirms or dismisses every flag.
          </li>
          <li>
            <strong>Prototype notice.</strong> Every page says WatchDog is a prototype and does
            not replace calling 911 or Campus Police.
          </li>
          <li>
            <strong>Review log.</strong> Each flag, its confidence score, and the reviewer's
            decision are recorded and can be exported.
          </li>
          <li>
            <strong>No facial recognition.</strong> WatchDog looks for objects, not faces, and
            does not identify anyone.
          </li>
          <li>
            <strong>Video stays on your device.</strong> The model runs inside your browser,
            so clips you upload are never sent to a server.
          </li>
          <li>
            <strong>No real people on campus.</strong> Test clips are staged at home with an
            orange-tipped prop gun.
          </li>
        </ul>

        <h3>How it works</h3>
        <p>
          The detector is <strong>Model Dublin</strong>, a YOLO11m model from Ultralytics trained
          to find guns and knives. It learned from about 146,000 public weapon images, several
          from real CCTV, plus about 49,000 look-alike photos (phones, umbrellas, remotes) that
          teach it what is not a gun. On 11,694 images it never trained on, it scored 0.874 for
          guns (mAP50) and raised false alarms on only 0.2% of look-alike photos. It is exported
          to ONNX and runs in the browser with ONNX Runtime Web. The site is built with React and
          Vite and hosted on AWS Amplify.
        </p>
        <p>
          <strong>Speed.</strong> On a cloud graphics card, Model Dublin checks a frame in about
          0.3 seconds. The web demo runs it inside your browser, so speed depends on your
          computer.
        </p>
        <p>
          Detectors make mistakes. A false alarm could send responders toward someone holding
          an umbrella; a miss could give false confidence. That is why a person reviews every
          flag, and why the confidence score is always shown.
        </p>

        <h3>How well it works</h3>
        <p>
          We test WatchDog on clips staged at home with an orange-tipped prop gun. Unlike stock
          footage, home filming lets us control lighting, image quality, camera height and angle
          to imitate campus CCTV. The test set has 6 clips with the prop gun and 36 with
          everyday objects that could fool a detector, such as a phone, backpack, laptop,
          scissors and keys, each filmed in normal and dim light.
        </p>
        <ResultsTable />
        <p>
          Every gun clip was flagged at 76 to 86% confidence, and 99.9% of checked frames in the
          no-gun clips raised no false alarm.
        </p>
        <p>
          <strong>Optimized for CCTV.</strong> Model Dublin is trained to detect guns in any
          footage. WatchDog adds limits to optimize it for CCTV: on a ceiling camera a whole
          person fills a small part of the frame, so a real gun is always small, and anything
          taller than a quarter of the frame is ignored. In early testing, dark doorways in dim
          light caused most false alarms. This limit fixed it.
        </p>

        <h3>Roadmap</h3>
        <ul>
          <li>A new demo video filmed in CCTV style</li>
          <li>A simple campus map that shows which camera raised a flag</li>
          <li>Tracking across multiple cameras</li>
          <li>Movement prediction for responders</li>
        </ul>

        <div className="actions actions-left">
          <a className="button button-primary" href="#/demo">View Demo</a>
        </div>
      </article>
    </Shell>
  )
}
