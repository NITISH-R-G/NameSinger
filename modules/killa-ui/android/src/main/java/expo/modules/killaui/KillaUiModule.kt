package expo.modules.killaui

import ai.jackknife.killayue.Deck
import ai.jackknife.killayue.RecordSpin
import ai.jackknife.killayue.Skin
import ai.jackknife.killayue.StaffProgress
import ai.jackknife.killayue.Ui
import android.content.Context
import android.graphics.Typeface
import android.text.InputFilter
import android.text.InputType
import android.text.Editable
import android.text.TextWatcher
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/** Native views built from Killa YuE's own classes (Skin, Ui, StaffProgress, Deck). See NOTICE.md. */
class KillaUiModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KillaUi")

    View(KillaButtonView::class) {
      Events("onPress")
      Prop("label") { view: KillaButtonView, v: String -> view.label = v; view.apply() }
      // "primary": the big script plate (Ui.button primary); "plate": Ui.button secondary; "tab": a tab plate of the row
      Prop("variant") { view: KillaButtonView, v: String -> view.variant = v; view.apply() }
      Prop("selected") { view: KillaButtonView, v: Boolean -> view.chosen = v; view.apply() }
      Prop("disabled") { view: KillaButtonView, v: Boolean -> view.disabled = v; view.apply() }
    }

    View(KillaFieldView::class) {
      Events("onChangeText", "onSubmit")
      Prop("value") { view: KillaFieldView, v: String -> view.setValue(v) }
      Prop("hint") { view: KillaFieldView, v: String -> view.edit.hint = v }
      Prop("maxLength") { view: KillaFieldView, v: Int -> view.edit.filters = arrayOf<InputFilter>(InputFilter.LengthFilter(v)) }
    }

    View(KillaStaffView::class) {
      Prop("progress") { view: KillaStaffView, v: Int -> view.bar.setProgress(v) }
      Prop("indeterminate") { view: KillaStaffView, v: Boolean -> view.bar.setIndeterminate(v) }
    }

    View(KillaRecordView::class) {
      Prop("spinning") { view: KillaRecordView, v: Boolean -> view.record.setSpinning(v) }
    }

    View(KillaDeckView::class) {
      Prop("source") { view: KillaDeckView, v: String? -> view.setSong(v) }
      Prop("title") { view: KillaDeckView, v: String -> view.deck.setTitle(v) }
      AsyncFunction("replay") { view: KillaDeckView -> view.deck.replay() }
    }
  }
}

/** A Killa plate button. Heights and type sizes follow MainActivity.tabPlate / Ui.button; the host sets the size. */
class KillaButtonView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onPress by EventDispatcher()
  var label = ""
  var variant = "plate"
  var chosen = false
  var disabled = false
  private val button: Button

  init {
    Skin.load(context)
    button = Button(context)
    button.setOnClickListener { if (!disabled) onPress(mapOf<String, Any>()) }
    addView(button, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
  }

  override val shouldUseAndroidLayout = true

  fun apply() {
    val c = context
    val b = button
    b.text = label
    b.isAllCaps = false
    b.setShadowLayer(5f, 0f, 2f, 0xCC000000.toInt())
    b.stateListAnimator = null
    b.isEnabled = !disabled
    b.alpha = if (disabled) 0.5f else 1f
    b.isSingleLine = true
    when (variant) {
      "primary" -> {
        b.typeface = Skin.script()
        b.textSize = 24f
        b.setTextColor(Skin.ACCENT)
        b.background = Skin.Plate(true)
        b.setPadding(Ui.dp(c, 30), 0, Ui.dp(c, 30), Ui.dp(c, 2))
      }
      "chip" -> {
        // Ui.chip: PILL fill, 1dp EDGE stroke, 18dp radius, bold ACCENT text. Selected (not in Killa, which only inserts text):
        // the same pill filled with the accent and dark lettering, so the choice is unmistakable.
        b.typeface = Typeface.DEFAULT_BOLD
        b.textSize = 14f
        val pill = Ui.box(c, if (chosen) Skin.ACCENT else Skin.PILL, 22)
        pill.setStroke(Ui.dp(c, if (chosen) 2 else 1), if (chosen) Skin.HI else Skin.EDGE)
        b.background = pill
        b.setTextColor(if (chosen) Skin.DECK else Skin.ACCENT)
        b.setShadowLayer(0f, 0f, 0f, 0)
        b.setPadding(Ui.dp(c, 14), 0, Ui.dp(c, 14), 0)
      }
      "tab" -> {
        // a plate of the tab row: chosen = pushed in (Plate sunk) with the highlight colour, others the quiet colour
        b.typeface = Skin.text()
        b.setTypeface(Skin.text(), Typeface.BOLD)
        b.textSize = 14f
        b.setTextColor(if (chosen) Skin.HI else Skin.LO)
        b.background = Skin.Plate(true, chosen)
        b.setPadding(Ui.dp(c, 2), 0, Ui.dp(c, 2), Ui.dp(c, 1))
      }
      else -> {
        b.setTypeface(Skin.text(), Typeface.BOLD)
        b.textSize = 15f
        b.setTextColor(Skin.TEXT)
        b.background = Skin.Plate(false)
        b.setPadding(Ui.dp(c, 18), 0, Ui.dp(c, 18), Ui.dp(c, 1))
      }
    }
    b.minHeight = 0
    b.minimumHeight = 0
    b.contentDescription = label
  }
}

/** Killa's glass text field (Ui.edit) for a single-line name. */
class KillaFieldView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onChangeText by EventDispatcher()
  private val onSubmit by EventDispatcher()
  val edit: EditText
  private var setting = false

  init {
    Skin.load(context)
    edit = Ui.edit(context, "", 1)
    edit.textSize = 18f
    edit.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
    edit.imeOptions = EditorInfo.IME_ACTION_DONE
    edit.typeface = Skin.text()
    edit.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
      override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
      override fun afterTextChanged(s: Editable?) {
        if (!setting) onChangeText(mapOf("text" to (s?.toString() ?: "")))
      }
    })
    edit.setOnEditorActionListener { _, id, _ ->
      if (id == EditorInfo.IME_ACTION_DONE) { onSubmit(mapOf<String, Any>()); false } else false
    }
    addView(edit, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
  }

  override val shouldUseAndroidLayout = true

  fun setValue(v: String) {
    if (edit.text.toString() == v) return
    setting = true
    edit.setText(v)
    edit.setSelection(edit.text.length)
    setting = false
  }
}

/** Killa's StaffProgress, unmodified. */
class KillaStaffView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  val bar: StaffProgress

  init {
    Skin.load(context)
    bar = StaffProgress(context)
    bar.setMax(1000)
    addView(bar, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
  }

  override val shouldUseAndroidLayout = true
}

class KillaRecordView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  val record: RecordSpin

  init {
    Skin.load(context)
    record = RecordSpin(context)
    addView(record, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
  }

  override val shouldUseAndroidLayout = true
}

class KillaDeckView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  val deck: Deck
  private var current: String? = null

  init {
    Skin.load(context)
    deck = Deck(context)
    addView(deck, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
  }

  override val shouldUseAndroidLayout = true

  fun setSong(path: String?) {
    if (path == current) return
    current = path
    deck.setSource(path, true)
  }
}
