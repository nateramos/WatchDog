import { Shell } from './Layout.jsx'
// Results of tracking/eval_clips.py on the 42 staged home clips (tracking/eval/results.csv).
const RESULTS = [
  { label: 'Gun clips caught', bright: '3 of 3', dim: '3 of 3', total: '6 of 6 (100%)' },
  { label: 'No-gun clips with no false alarm', bright: '18 of 18', dim: '17 of 18', total: '35 of 36 (97.2%)' },
]

// Results of tracking/eval_clips.py on five clips of released security footage from three
// real school shootings. The footage itself is not in the repo.
const REAL = [
  { clip: 'Uvalde, 15 s', camera: 'Fisheye ceiling camera', alerts: 2, top: '66%', frames: '5 of 60' },
  { clip: 'Parkland, 27 s', camera: 'Stairwell, smoky hallway', alerts: 2, top: '82%', frames: '12 of 109' },
  { clip: 'Nashville 1, 19 s', camera: 'Ceiling camera, hallway', alerts: 2, top: '77%', frames: '27 of 77' },
  { clip: 'Nashville 2, 10 s', camera: 'Ceiling camera, hallway', alerts: 1, top: '84%', frames: '20 of 40' },
  { clip: 'Nashville 3, 7 s', camera: 'Ceiling camera, lobby', alerts: 1, top: '76%', frames: '22 of 28' },
]

function RealResultsTable() {
  return (
    <div className="table-wrap results">
      <table>
        <caption>Model Dublin on real CCTV from three school shootings</caption>
        <thead>
          <tr>
            <th>Clip</th>
            <th>Camera</th>
            <th>Alerts</th>
            <th>Highest confidence</th>
            <th>Checked frames flagged</th>
          </tr>
        </thead>
        <tbody>
          {REAL.map((r) => (
            <tr key={r.clip}>
              <td>{r.clip}</td>
              <td>{r.camera}</td>
              <td className="result-right">{r.alerts}</td>
              <td>{r.top}</td>
              <td>{r.frames}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

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

        <h3>What WatchDog does</h3>
        <ol>
          <li>
            It watches a building's cameras. An object detection model checks about four
            frames per second for a possible gun and gives each finding a confidence score.
            The model is trained on both guns and knives, but WatchDog flags firearms only.
          </li>
          <li>
            The first time a gun is seen, it sends an alert to the Alerts page: a snapshot
            right away, then a clip from one second before to four seconds after, which the
            reviewer can pause and scrub through.
          </li>
          <li>
            A person must confirm the threat or dismiss it as a false alarm, and signs each
            decision with their name.
          </li>
          <li>Every alert and every reviewer decision is written to a log.</li>
        </ol>
        <p>
          This prototype has no live camera connected yet. The <a href="#/demo">Demo</a> page
          replays WatchDog's real results on a wall of eight cameras instead: one shows released
          footage of an attack, and the others show ordinary people.
        </p>

        <h3>Safety guardrails</h3>
        <ul>
          <li>
            <strong>Human in the loop.</strong> The model never raises an alert by itself. A
            reviewer confirms or dismisses every flag.
          </li>
          <li>
            <strong>Prototype notice.</strong> Every page says WatchDog is a prototype and does
            not replace calling 911.
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
            <strong>Video is checked on your device.</strong> The model runs inside your
            browser, so no video is sent to a server to be analyzed.
          </li>
          <li>
            <strong>Real footage, handled with care.</strong> Footage of an attack comes only
            from video that police and news outlets released publicly, shown on one camera, once.
            Everyday footage comes from public research datasets. All of it is credited, kept out
            of the code repository, and the Demo page warns before showing the attack.
          </li>
          <li>
            <strong>Staged clips, never on campus.</strong> Home test clips use an
            orange-tipped prop gun and were filmed at home, not on campus.
          </li>
        </ul>

        <h3>How it works</h3>
        <p>
          The detector is <strong>Model Dublin</strong>, a YOLO11m model from Ultralytics trained
          to find guns and knives. It learned from about 146,000 public weapon images, several
          from real CCTV, plus about 49,000 look-alike photos (phones, umbrellas, remotes) that
          teach it what is not a gun, over 50 passes through the training images. On 11,694
          images it never trained on, it scored 0.874 for guns (mAP50) and raised false alarms on only 0.2% of look-alike photos. It is exported
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
          <strong>Lab test.</strong> On 11,694 test images it had never seen, Model Dublin scored
          0.874 out of 1 for guns on mAP50, the standard accuracy score for detectors (1.0 would
          be perfect). It also correctly ignored 99.8% of 5,495 look-alike photos, such as phones,
          umbrellas and remotes.
        </p>
        <p className="muted">
          Scores like this can't be compared directly with other gun detectors. Each study tests
          on its own set of images, some easy (clear photos) and some very hard (blurry CCTV), so
          a higher score elsewhere doesn't mean a better detector, or a lower one a worse detector.
        </p>
        <p>
          <strong>Real CCTV.</strong> We ran WatchDog on five clips of security camera footage
          from three real school shootings, released publicly by police and news outlets:
          Uvalde (2022), Parkland (2018) and Nashville (2023). They cover very different
          cameras: a fisheye ceiling camera, a stairwell and a smoke-filled hallway, and
          ordinary ceiling CCTV.
        </p>
        <RealResultsTable />
        <p>
          WatchDog raised an alert on all five clips, and all 8 alerts were on the real gun (we
          checked every alert snapshot by hand). It did best on ordinary ceiling cameras and
          struggled most with Uvalde's fisheye lens and distant figure, where it caught the
          rifle in moments rather than the whole time. That is enough to point a reviewer at
          the camera, which is WatchDog's job.
        </p>
        <p>
          <strong>An hour of ordinary campus CCTV.</strong> A school will ask how often WatchDog
          raises a false alarm on an ordinary day. We ran it on one hour of everyday security
          footage with no guns: 115 clips from all 13 cameras of the public ShanghaiTech Campus
          dataset, with students walking and carrying backpacks, bags and phones, some of them
          crowded and close to the camera. It checked 12,670 frames and raised{' '}
          <strong>no false alarm</strong>. The same setup still caught the gun in the Nashville
          clips, so the detector was working. Zero in one hour does not mean never, which is
          why a person reviews every alert; an indoor hallway test is next.
        </p>
        <p>
          <strong>Staged home clips.</strong> We also filmed 42 clips at home with an
          orange-tipped prop gun: 6 with the prop gun and 36 with everyday objects that could
          fool a detector, such as a phone, backpack, laptop, scissors and keys, each in normal
          and dim light.
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
          <li>Connecting live cameras</li>
          <li>Checking feeds without ever slowing the page down</li>
          <li>A campus map that shows which camera raised an alert</li>
          <li>Following a person or gun across cameras, and predicting where they are heading</li>
          <li>A one-click incident report for police and administrators</li>
          <li>A longer false-alarm test on indoor school footage</li>
        </ul>

        <div className="actions actions-left">
          <a className="button button-primary" href="#/cameras">Open WatchDog</a>
        </div>
      </article>
    </Shell>
  )
}
