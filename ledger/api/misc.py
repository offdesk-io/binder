from fastapi import APIRouter, Depends

from ..auth import Identity, guard

router = APIRouter()


@router.get("/whoami")
def whoami(who: Identity = Depends(guard)):
    return {"email": who.email, "name": who.name, "teams": list(who.teams)}
