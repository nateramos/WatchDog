import { Shell } from './Layout.jsx'
import { NO_WEAPON, WEAPON } from './hardCases.js'

function ResultsTable({ title, rows, right, wrong }) {
  return (
    <div className="table-wrap results">
      <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Clip</th>
            <th>What WatchDog flagged</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.clip}>
              <td>{r.clip}</td>
              <td>{r.flagged}</td>
              <td className={r.correct ? 'result-right' : 'result-wrong'}>{r.correct ? right : wrong}</td>
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
          <li>You upload a recorded video clip, or run the demo video.</li>
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
            <strong>No real people on campus.</strong> Testing uses licensed stock footage only.
          </li>
        </ul>

        <h3>How it works</h3>
        <p>
          The detector is YOLOv8n from Ultralytics, fine-tuned to find guns and knives using
          labeled images from Google's Open Images dataset. It is exported to ONNX and runs in
          the browser with ONNX Runtime Web. The site is built with React and Vite and hosted
          on AWS Amplify.
        </p>
        <p>
          <strong>Speed.</strong> On a 2020 MacBook Air (Intel Core i5, no graphics card), the
          desktop prototype takes about a quarter of a second to run all three steps on one
          frame (person, object, weapon), or about 4 frames per second. The weapon check alone
          takes about 0.1 seconds. The web demo runs only the weapon check, inside the browser
          on one processor core, so it is slower: about 1 to 1.5 seconds per frame.
        </p>
        <p>
          Detectors make mistakes. A false alarm could send responders toward someone holding
          an umbrella; a miss could give false confidence. That is why a person reviews every
          flag, and why the confidence score is always shown.
        </p>

        <h3>Where it gets it wrong</h3>
        <p>
          The demo clip is an easy case. To find the mistakes, we ran 19 licensed stock clips
          through the same model and settings as this demo: 11 with no weapon but something that
          could fool it, and 8 with a weapon, mostly indoors or in the dark. We checked every
          flag by hand.
        </p>
        <ul>
          <li>
            <strong>Caught 6 of 8 weapons.</strong> Both misses were dark, backlit handguns
            filmed in portrait.
          </li>
          <li>
            <strong>False alarms in 7 of 11 no-weapon clips</strong>, on 5.4% of checked frames.
            Drills, tripods, a hair dryer and a saxophone look like guns to the model.
          </li>
          <li>
            <strong>The threshold is a trade-off.</strong> Raising it from 40% to 60% would
            remove 10 of the 13 false flags but also miss two real weapons.
          </li>
        </ul>
        <ResultsTable title="No weapon in the clip" rows={NO_WEAPON} right="Correct" wrong="False alarm" />
        <ResultsTable title="Weapon in the clip" rows={WEAPON} right="Caught" wrong="Missed" />
        <p className="muted">
          19 clips is a small test, not a benchmark. Scores come from a desktop rerun of this
          demo's code (<code>tracking/eval_clips.py</code> on GitHub) and can differ by a point
          or two here.
        </p>

        <h3>Roadmap</h3>
        <ul>
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
