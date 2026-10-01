import grist
from functions import *       # global uppercase functions
import datetime, math, re     # modules commonly needed in formulas


@grist.UserTable
class ALLCAPS:
  A = grist.Text()


@grist.UserTable
class Choices:
  Pick = grist.Choice()
  NoChoices = grist.Choice()
  Styled = grist.Choice()
  Nasty = grist.Choice()
  Many = grist.ChoiceList()
  Tags = grist.ChoiceList()
  Conditional = grist.Choice()
  Aligned = grist.Choice()
  Form = grist.ChoiceList()


@grist.UserTable
class Dates:
  Day = grist.Date()
  French = grist.Date()
  Iso = grist.Date()
  Paris = grist.DateTime('Europe/Paris')
  Utc = grist.DateTime('UTC')
  NewYork = grist.DateTime('America/New_York')
  Kolkata = grist.DateTime('Asia/Kolkata')
  BuenosAires = grist.DateTime('America/Argentina/Buenos_Aires')


@grist.UserTable
class Flags:
  Plain = grist.Bool()
  Box = grist.Bool()
  Switch = grist.Bool()


@grist.UserTable
class Formulas:
  Data1 = grist.Text()
  Data2 = grist.Int()
  Data3 = grist.Text()

  @grist.formulaType(grist.Text())
  def FText(rec, table):
    return rec.Data1

  @grist.formulaType(grist.Numeric())
  def FNum(rec, table):
    return rec.Data2 * 2

  @grist.formulaType(grist.Bool())
  def FBool(rec, table):
    return True

  @grist.formulaType(grist.Date())
  def FDate(rec, table):
    return None

  @grist.formulaType(grist.DateTime('Europe/Paris'))
  def FDateTime(rec, table):
    return NOW()

  @grist.formulaType(grist.Choice())
  def FChoice(rec, table):
    return 'a'

  @grist.formulaType(grist.ChoiceList())
  def FList(rec, table):
    return []

  @grist.formulaType(grist.Reference('Texts'))
  def FRef(rec, table):
    return Texts.lookupOne(Plain='x')

  @grist.formulaType(grist.ReferenceList('Texts'))
  def FRefList(rec, table):
    return Texts.lookupRecords()

  def FAny(rec, table):
    return None


@grist.UserTable
class Ids:
  a = grist.Text()
  A_b = grist.Text()
  x1 = grist.Text()
  X__Y = grist.Text()
  LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL = grist.Text()
  Select = grist.Text()
  None_ = grist.Text()
  rec = grist.Text()
  table = grist.Text()
  value = grist.Text()
  user = grist.Text()
  SUM = grist.Text()
  lowerUpper = grist.Text()
  ALLCAPS = grist.Text()
  trailing_ = grist.Text()


@grist.UserTable
class LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL:
  A = grist.Text()


@grist.UserTable
class Links:
  Text = grist.Text()
  ToTexts = grist.Reference('Texts')
  Shown = grist.Reference('Texts')
  Many = grist.ReferenceList('Texts')
  Self = grist.Reference('Links')
  SelfList = grist.ReferenceList('Links')
  ToNumbers = grist.Reference('Numbers')
  Styled = grist.Reference('Texts')


@grist.UserTable
class Misc:
  Files = grist.Attachments()
  FilesTall = grist.Attachments()
  Anything = grist.Any()


@grist.UserTable
class Numbers:
  Plain = grist.Numeric()
  Eur = grist.Numeric()
  Pct = grist.Numeric()
  Sci = grist.Numeric()
  Dec = grist.Numeric()
  Spin = grist.Numeric()
  Whole = grist.Int()
  WholeUsd = grist.Int()
  WholeSpin = grist.Int()
  BackToLinks = grist.Reference('Links')


@grist.UserTable
class T:
  A = grist.Text()


@grist.UserTable
class Table1:

  def A(rec, table):
    return None

  def B(rec, table):
    return None

  def C(rec, table):
    return None


@grist.UserTable
class Texts:
  Plain = grist.Text()
  Aligned = grist.Text()
  Link = grist.Text()
  Markdown = grist.Text()
  Styled = grist.Text()
  Labelled = grist.Text()
  Described = grist.Text()
  Form = grist.Text()
  Rules = grist.Text()
  Nasty0 = grist.Text()
  Nasty1 = grist.Text()
  Nasty2 = grist.Text()
  Nasty3 = grist.Text()
  Nasty4 = grist.Text()
  Nasty5 = grist.Text()
  Nasty6 = grist.Text()
  Nasty7 = grist.Text()
  Nasty8 = grist.Text()
  Nasty9 = grist.Text()
  Nasty10 = grist.Text()
  Nasty11 = grist.Text()
  Nasty12 = grist.Text()
  Nasty13 = grist.Text()


@grist.UserTable
class With_Under:
  A = grist.Text()
